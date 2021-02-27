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
 * AWS segment definition.
 */
export interface SegmentJson extends SubsegmentJson {
  /**
   * A unique identifier that connects all segments and subsegments originating from a single client request.
   */
  trace_id: string;
  /**
   * An object with information about your application.
   */
  service?: {
    /**
     * A string that identifies the version of your application that served the request.
     */
    version: string;
  };
  /**
   * A string that identifies the user who sent the request.
   */
  user?: string;
  /**
   * A subsegment ID you specify if the request originated from an instrumented application. The X-Ray SDK adds the parent subsegment ID to the tracing header for downstream HTTP calls. In the case of nested subsegments, a subsegment can have a segment or a subsegment as its parent.
   */
  parent_id?: string;
}

/**
 * AWS segment HTTP definition.
 */
export interface SegmentHttpJson {
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
}

/**
 * AWS sub-segment definition.
 */
export interface SubsegmentJson {
  /**
   * The logical name of the service that handled the request, up to 200 characters. For example, your application's name or domain name. Names can contain Unicode letters, numbers, and whitespace, and the following symbols: _, ., :, /, %, &, #, =, +, \, -, @.
   */
  name: string;
  /**
   * A 64-bit identifier for the segment, unique among segments in the same trace, in 16 hexadecimal digits.
   */
  id: string;
  /**
   * That is the time the segment was created, in floating point seconds in epoch time. For example, `1480615200.010` or `1.480615200010E9`. Use as many decimal places as you need. Microsecond resolution is recommended when available.
   */
  start_time: number;
  /**
   * That is the time the segment was closed. For example, `1480615200.090` or `1.480615200090E9`. Specify either an `end_time` or `in_progress`.
   */
  end_time?: number;
  /**
   * Set to `true` instead of specifying an `end_time` to record that a segment is started, but is not complete. Send an in-progress segment when your application receives a request that will take a long time to serve, to trace the request receipt. When the response is sent, send the complete segment to overwrite the in-progress segment. Only send one complete segment, and one or zero in-progress segments, per request.
   */
  in_progress?: boolean;
  /**
   * Object with key-value pairs that you want X-Ray to index for search.
   */
  annotations?: Record<string, string | number | boolean>;
  /**
   * Object with any additional data that you want to store in the segment.
   */
  metadata?: Record<string, unknown>;
  /**
   * Array of subsegment objects.
   */
  subsegments?: SubsegmentJson[];
  /**
   * HTTP objects with information about the original HTTP request.
   */
  http?: SegmentHttpJson;
  /**
   * Indicates that a client error occurred (response status code was 4XX Client Error).
   */
  error?: boolean;
  /**
   * Indicates that a server error occurred (response status code was 5XX Server Error).
   */
  fault?: boolean;
  /**
   * Indicates that a request was throttled (response status code was 429 Too Many Requests).
   */
  throttle?: boolean;
  /**
   * A cause can be either a 16 character exception ID or an object.
   */
  cause?: string | SegmentCauseJson;
}

/**
 * HTTP segment request.
 */
export interface SegmentHttpRequest {
  /**
   * The full URL of the request, compiled from the protocol, hostname, and path of the request.
   */
  url?: string;
  /**
   * The request method. For example, `GET`.
   */
  method?: string;
  /**
   * The user agent string from the requester's client.
   */
  userAgent?: string;
  /**
   * The IP address of the requester. Can be retrieved from the IP packet's Source Address or, for forwarded requests, from an `X-Forwarded-For` header.
   */
  clientIp?: string;
  /**
   * Boolean indicating that the client_ip was read from an X-Forwarded-For header and is not reliable as it could have been forged (segments only).
   */
  xForwardedFor?: boolean;
  /**
   * Boolean indicating that the downstream call is to another traced service. If this field is set to true, X-Ray considers the trace to be broken until the downstream service uploads a segment with a parent_id that matches the id of the subsegment that contains this block (subsegments only).
   */
  traced?: boolean;
}

/**
 * HTTP segment response.
 */
export interface SegmentHttpResponse {
  /**
   * Number indicating the HTTP status of the response.
   */
  status?: number;
  /**
   * Number indicating the length of the response body in bytes.
   */
  contentLength?: number;
}

export interface StackFrameJson {
  /**
   * The relative path to the file.
   */
  path?: string;
  /**
   * The line in the file.
   */
  line?: number;
  /**
   * The function or method name.
   */
  label?: string;
}

export interface SegmentExceptionJson {
  /**
   * A 64-bit identifier for the exception, unique among segments in the same trace, in 16 hexadecimal digits.
   */
  id: string;
  /**
   * The exception message.
   */
  message?: string;
  /**
   * The exception type.
   */
  type?: string;
  /**
   * Indicates that the exception was caused by an error returned by a downstream service.
   */
  remote?: boolean;
  /**
   * Indicates the number of stack frames that are omitted from the stack.
   */
  truncated?: number;
  /**
   * Indicates the number of exceptions that were skipped between this exception and its child, that is, the exception that it caused.
   */
  skipped?: number;
  /**
   * Exception ID of the exception's parent, that is, the exception that caused this exception.
   */
  cause?: string;
  /**
   * Array of `StackFrame` objects.
   */
  stack?: StackFrameJson[];
}

/**
 * Segment cause JSON definition.
 */
export interface SegmentCauseJson {
  /**
   * The full path of the working directory when the exception occurred.
   */
  working_directory?: string;
  /**
   * The array of paths to libraries or modules in use when the exception occurred.
   */
  paths?: string[];
  /**
   * The array of exception objects.
   */
  exceptions?: SegmentExceptionJson[];
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
 * Capture stack frames from an error instance.
 */
export function captureStackFrames(error: Error): StackFrameJson[] {
  return getErrorStack(error).map(
    (frame): StackFrameJson => ({
      path: frame.getFileName() ?? undefined,
      line: frame.getLineNumber() ?? undefined,
      label: frame.getFunctionName() ?? undefined,
    })
  );
}

/**
 * Create a segment exception object from an error instance.
 */
export function captureException(
  error: Error,
  cause?: string
): SegmentExceptionJson {
  return {
    id: generateId(16),
    message: error.message,
    cause: cause,
    stack: captureStackFrames(error),
  };
}

/**
 * Segment `cause` wrapper.
 */
export class SegmentCause {
  exceptions: SegmentExceptionJson[] = [];

  constructor(public directory?: string, public paths?: string[]) {}

  /**
   * Capture an error and any associated `cause`.
   */
  captureException(error: Error) {
    let err = error;
    let id: string | undefined = undefined;

    while (err instanceof Error) {
      const exception = captureException(error, id);
      this.exceptions.push(exception);
      id = exception.id;
      err = (err as any).cause;
    }

    if (this.exceptions.length === 0) {
      throw new TypeError("Invalid error, should be instance of `Error`");
    }
  }

  toJSON(): SegmentCauseJson {
    return {
      working_directory: this.directory,
      paths: this.paths,
      exceptions: this.exceptions,
    };
  }
}

/**
 * HTTP segment instance.
 */
export class SegmentHttp {
  constructor(
    public request?: SegmentHttpRequest,
    public response?: SegmentHttpResponse
  ) {}

  toJSON(): SegmentHttpJson {
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
  cause?: string | SegmentCause;

  constructor(public name: string, public traceId: string) {}

  /**
   * Start a new subsegment.
   */
  startSegment(name: string): Subsegment {
    const segment = new Subsegment(name, this.traceId);
    this.subsegments.push(segment);
    return segment;
  }

  /**
   * End the current segment by setting `endTime` to now.
   */
  end() {
    this.endTime = Date.now();
    return this;
  }

  /**
   * Capture the error instance as the cause, enables `error`.
   */
  captureException(error: Error, cwd?: string) {
    this.error = true;
    this.cause = new SegmentCause(cwd);
    this.cause.captureException(error);
  }

  toJSON(): SubsegmentJson {
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
      cause: this.cause
        ? typeof this.cause === "string"
          ? this.cause
          : this.cause.toJSON()
        : undefined,
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

  toJSON(): SegmentJson {
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
    this.fetch = options.fetch ?? fetch.bind(null);
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
      const contentLength = res.headers.get("Content-Length");
      segment.error = code === 4;
      segment.fault = code === 5;
      segment.throttle = res.status === 429;
      segment.http.response = {
        status: res.status,
        contentLength: (contentLength && Number(contentLength)) || undefined,
      };
      return res;
    } catch (err) {
      segment.captureException(err);
      throw err;
    } finally {
      segment.end();
    }
  };
}

/**
 * V8 call site trace.
 *
 * Ref: https://v8.dev/docs/stack-trace-api
 */
interface CallSite {
  getThis(): any;
  getTypeName(): string | null;
  getFunction(): (...args: any) => any | undefined;
  getFunctionName(): string | null;
  getMethodName(): string | null;
  getFileName(): string | null;
  getLineNumber(): number | null;
  getColumnNumber(): number | null;
  getEvalOrigin(): string | undefined;
  isToplevel(): boolean;
  isEval(): boolean;
  isNative(): boolean;
  isConstructor(): boolean;
  isAsync(): boolean;
  isPromiseAll(): boolean;
  getPromiseIndex(): number | null;
}

/**
 * Parse V8 call sites from error instance.
 */
function getErrorStack(error: Error): CallSite[] {
  const prepareStackTrace = Error.prepareStackTrace;
  let trace: CallSite[];

  Error.prepareStackTrace = (error, v8Trace) => {
    trace = v8Trace as CallSite[];
    return prepareStackTrace?.(error, v8Trace);
  };

  Error.captureStackTrace(error, getErrorStack);
  error.stack; // Triggers `prepareStackTrace`.
  Error.prepareStackTrace = prepareStackTrace;

  return trace!;
}
