import { AwsClient } from "aws4fetch";

/**
 * Request interface (e.g. `fetch`).
 */
export type Fetch = (request: Request) => Promise<Response>;

/**
 * AWS X-Ray HTTP header for passing around trace information.
 */
export const AWS_TRACE_HEADER = "X-Amzn-Trace-Id";

/**
 * AWS error response wrapper.
 */
export class AwsError extends Error {
  constructor(public status: number) {
    super(
      `AWS X-Ray responded with HTTP status ${status}. Documentation: https://docs.aws.amazon.com/xray/latest/api/API_PutTraceSegments.html`
    );
  }
}

/**
 * AWS list of unprocessed segments.
 */
export interface UnprocessedSegments {
  code?: string;
  id?: string;
  message?: string;
}

/**
 * AWS unprocessed segments error wrapper.
 */
export class UnprocessedError extends Error {
  constructor(public unprocessedSegments: UnprocessedSegments[]) {
    super(`AWS failed to process all segments`);
  }
}

/**
 * Subsegment not ended error.
 */
export class SubsegmentNotEndedError extends TypeError {
  constructor(public segment: Subsegment) {
    super(`Subsegment not ended: ${segment.name}`);
  }
}

/**
 * AWS segment definition.
 */
export type SegmentJSON = SubsegmentJSON & {
  trace_id: string;
  service?: { version: string };
  user?: string;
  parent_id?: string;
};

/**
 * AWS segment HTTP definition.
 */
export type SegmentHttpJSON = {
  request?: {
    url?: string;
    method?: string;
    user_agent?: string;
    client_ip?: string;
    x_forwarded_for?: boolean;
    traced?: boolean;
  };
  response?: {
    status?: number;
    content_length?: number;
  };
};

/**
 * AWS sub-segment definition.
 */
export type SubsegmentJSON = {
  name: string;
  id: string;
  start_time: number;
  end_time?: number;
  annotations?: Record<string, string | number | boolean>;
  metadata?: Record<string, unknown>;
  subsegments?: SubsegmentJSON[];
  http?: SegmentHttpJSON;
  error?: boolean;
  fault?: boolean;
  throttle?: boolean;
};

/**
 * HTTP segment request.
 */
export type SegmentHttpRequest = {
  url?: string;
  method?: string;
  userAgent?: string;
  clientIp?: string;
  xForwardedFor?: boolean;
  traced?: boolean;
};

/**
 * HTTP segment response.
 */
export type SegmentHttpResponse = {
  status?: number;
  contentLength?: number;
};

/**
 * HTTP segment instance.
 */
export class SegmentHttp {
  constructor(
    public request?: SegmentHttpRequest,
    public response?: SegmentHttpResponse
  ) {}

  toJSON(): SegmentHttpJSON {
    return {
      request: this.request
        ? {
            url: this.request.url,
            method: this.request.method,
            user_agent: this.request.userAgent,
            client_ip: this.request.clientIp,
            x_forwarded_for: this.request.xForwardedFor,
            traced: this.request.traced,
          }
        : undefined,
      response: this.response
        ? {
            status: this.response.status,
            content_length: this.response.contentLength,
          }
        : undefined,
    };
  }
}

/**
 * Subsegment wrapper.
 *
 * Docs: https://docs.aws.amazon.com/xray/latest/devguide/xray-api-segmentdocuments.html
 */
export class Subsegment {
  id = generateId(8);
  startTime = Date.now();
  endTime?: number;
  metadata: Record<string, unknown> = {};
  annotations: Record<string, string | number | boolean> = {};
  subsegments: Subsegment[] = [];
  http?: SegmentHttp;
  error?: boolean;
  throttle?: boolean;
  fault?: boolean;

  constructor(public name: string, public traceId: string) {}

  startSegment(name: string): Subsegment {
    const segment = new Subsegment(name, this.traceId);
    this.subsegments.push(segment);
    return segment;
  }

  end() {
    this.endTime = Date.now();
    return this;
  }

  toJSON(): SubsegmentJSON {
    if (!this.endTime) throw new SubsegmentNotEndedError(this);

    return {
      name: this.name,
      id: this.id,
      start_time: this.startTime / 1000,
      end_time: this.endTime / 1000,
      annotations: this.annotations,
      metadata: this.metadata,
      subsegments: this.subsegments.map((x) => x.toJSON()),
      http: this.http?.toJSON(),
      error: this.error,
      throttle: this.throttle,
      fault: this.fault,
    };
  }
}

/**
 * Segment instance, wraps `Subsegment` with automatic `traceId` and additional context allowed.
 */
export class Segment extends Subsegment {
  service?: { version: string };
  user?: string;

  constructor(name: string, public traceId = generateTraceId()) {
    super(name, traceId);
  }

  toJSON(): SegmentJSON {
    return {
      ...super.toJSON(),
      trace_id: this.traceId,
      user: this.user,
      service: this.service,
    };
  }
}

/**
 * AWS X-Ray constructor options.
 */
export interface AwsXrayOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fetch?: Fetch;
}

/**
 * AWS X-Ray helper instance.
 */
export class AwsXray {
  region: string;
  client: AwsClient;
  fetch: Fetch;

  constructor(options: AwsXrayOptions) {
    this.fetch = options.fetch || globalThis.fetch;
    this.region = options.region;
    this.client = new AwsClient({
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    });
  }

  /**
   * Submit AWS X-Ray segment to AWS.
   */
  async traceSegment(segment: Segment) {
    // Docs: https://docs.aws.amazon.com/xray/latest/api/API_PutTraceSegments.html
    const req = await this.client.sign(
      `https://xray.${this.region}.amazonaws.com/TraceSegments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          TraceSegmentDocuments: [JSON.stringify(segment)],
        }),
      }
    );

    const res = await this.fetch(req);
    if (!res.ok) throw new AwsError(res.status);

    const { UnprocessedTraceSegments: errors = [] } = (await res.json()) as {
      UnprocessedTraceSegments?: Array<{
        ErrorCode?: string;
        Id?: string;
        Message?: string;
      }>;
    };

    if (errors.length) {
      throw new UnprocessedError(
        errors.map((x) => ({ code: x.ErrorCode, id: x.Id, message: x.Message }))
      );
    }
  }
}

/**
 * Generate a unique AWS X-Ray compatible trace ID.
 */
function generateTraceId() {
  return `1-${Math.floor(Date.now() / 1000).toString(16)}-${generateId(12)}`;
}

/**
 * Generate unique ID for AWS X-Ray.
 */
function generateId(length: number) {
  const buffer = new Uint8Array(length);
  const randomBuffer = crypto.getRandomValues(buffer);
  return Array.from(randomBuffer, (b) => `00${b.toString(16)}`.slice(-2)).join(
    ""
  );
}

/**
 * Captured `fetch` type.
 */
export type CapturedFetch = (
  input: RequestInfo,
  init: RequestInit & { segment: Subsegment }
) => Promise<Response>;

/**
 * Wrap an instance of `fetch` with AWS X-Ray tracing and optional trace header forwarding.
 */
export function captureFetch(
  fetch: (input: Request) => Promise<Response>,
  forwardTrace = false
): CapturedFetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const segment = init.segment.startSegment(url.hostname);

    segment.http = new SegmentHttp({
      url: request.url,
      method: request.method,
      traced: forwardTrace,
    });

    if (forwardTrace) {
      request.headers.set(
        AWS_TRACE_HEADER,
        `Root=${segment.traceId};Parent=${segment.id};Sampled=1`
      );
    }

    try {
      const res = await fetch(request);
      const code = ~~(res.status / 100);
      segment.error = code === 4;
      segment.fault = code === 5;
      segment.throttle = res.status === 429;
      segment.http.response = { status: res.status };
      return res;
    } catch (err) {
      segment.error = true;
      throw err;
    } finally {
      segment.end();
    }
  };
}
