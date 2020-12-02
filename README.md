# Worker AWS X-Ray

[![NPM version][npm-image]][npm-url]
[![NPM downloads][downloads-image]][downloads-url]
[![Build status][travis-image]][travis-url]
[![Test coverage][coveralls-image]][coveralls-url]

> [AWS X-Ray](https://aws.amazon.com/xray/) client for Cloudflare Workers using `fetch`.

## Installation

```
npm install @borderless/worker-aws-xray --save
```

## Usage

```ts
import { AwsXray, Segment, captureFetch } from "@borderless/worker-aws-xray";

// Capture `fetch` with tracing support.
const fetch = captureFetch(globalThis.fetch);

// Create an AWS X-Ray client wrapper (for sending segments later).
const client = new AwsXray({
  region: "us-west-2",
  accessKeyId: "abc",
  secretAccessKey: "123",
});

addEventListener("fetch", async (event) => {
  const segment = new Segment("worker");

  // Create a subsegment attached to `segment`.
  const subsegment = segment.startSegment();

  // Trace `fetch` requests with our captured client.
  const res = await fetch("http://example.com", { segment: subsegment });

  // Segments must be ended before tracing.
  subsegment.end();
  segment.end();

  // Forward traced segments to AWS.
  event.waitUntil(client.traceSegment(segment));

  // Finally respond to Cloudflare request.
  event.respondWith(res);
});
```

## License

MIT

[npm-image]: https://img.shields.io/npm/v/@borderless/worker-aws-xray.svg?style=flat
[npm-url]: https://npmjs.org/package/@borderless/worker-aws-xray
[downloads-image]: https://img.shields.io/npm/dm/@borderless/worker-aws-xray.svg?style=flat
[downloads-url]: https://npmjs.com/package/@borderless/worker-aws-xray
[travis-image]: https://img.shields.io/travis/com/borderless/worker-aws-xray.svg?style=flat
[travis-url]: https://travis-ci.com/borderless/worker-aws-xray
[coveralls-image]: https://img.shields.io/coveralls/borderless/worker-aws-xray.svg?style=flat
[coveralls-url]: https://coveralls.io/r/borderless/worker-aws-xray?branch=master
