import {
  AwsXray,
  Segment,
  captureFetch,
  SegmentHttp,
  CapturedFetch,
} from "./index";

describe("worker aws x-ray", () => {
  const accessKeyId = "abc";
  const secretAccessKey = "123";
  const region = "test";
  let xray: AwsXray;
  let fetch: jest.Mock;

  beforeEach(() => {
    fetch = jest.fn();
    xray = new AwsXray({
      accessKeyId,
      secretAccessKey,
      region,
      fetch,
    });
  });

  describe("segment", () => {
    it("should create segment", () => {
      const segment = new Segment("worker");
      expect(segment.name).toEqual("worker");
      expect(typeof segment.traceId).toEqual("string");
      expect(typeof segment.id).toEqual("string");
      expect(typeof segment.startTime).toEqual("number");
    });

    it("should create subsegment", () => {
      const segment = new Segment("worker");
      const subsegment = segment.startSegment("child");

      expect(subsegment.name).toEqual("child");
      expect(segment.subsegments).toEqual([subsegment]);
    });

    it("should end segment", () => {
      const segment = new Segment("worker");
      expect(typeof segment.endTime).toEqual("undefined");

      segment.end();
      expect(typeof segment.endTime).toEqual("number");
    });
  });

  describe("captureFetch", () => {
    let wrapper: CapturedFetch;

    beforeEach(() => {
      wrapper = captureFetch(fetch);

      fetch.mockResolvedValueOnce(new Response(null, { status: 200 }));
    });

    it("should trace request", async () => {
      const segment = new Segment("test");
      expect(segment.subsegments.length).toEqual(0);

      const res = await wrapper("http://example.com", { segment });
      expect(res.status).toEqual(200);

      expect(segment.subsegments.length).toEqual(1);
      expect(segment.subsegments[0].name).toEqual("example.com");
      expect(segment.subsegments[0].http).toEqual(
        new SegmentHttp(
          { method: "GET", url: "http://example.com/", traced: false },
          { status: 200 }
        )
      );

      const request = fetch.mock.calls[0][0];
      expect(request.url).toEqual("http://example.com/");
      expect(request.method).toEqual("GET");
      expect(request.headers).toEqual(new Headers());
    });

    describe("with forward trace", () => {
      beforeEach(() => {
        wrapper = captureFetch(fetch, true);
      });

      it("should trace request", async () => {
        const segment = new Segment("test");
        expect(segment.subsegments.length).toEqual(0);

        const res = await wrapper("http://example.com", { segment });
        expect(res.status).toEqual(200);

        expect(segment.subsegments.length).toEqual(1);
        expect(segment.subsegments[0].name).toEqual("example.com");
        expect(segment.subsegments[0].http).toEqual(
          new SegmentHttp(
            { method: "GET", url: "http://example.com/", traced: true },
            { status: 200 }
          )
        );

        const request = fetch.mock.calls[0][0];
        expect(request.url).toEqual("http://example.com/");
        expect(request.method).toEqual("GET");
        expect(request.headers).toEqual(
          new Headers({
            "X-Amzn-Trace-Id": `Root=${segment.traceId};Parent=${segment.subsegments[0].id};Sampled=1`,
          })
        );
      });
    });
  });

  describe("trace segment", () => {
    describe("with 200 response", () => {
      beforeEach(() => {
        fetch.mockResolvedValueOnce(
          new Response('{"UnprocessedTraceSegments":[]}', {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      });

      it("should send segments to aws", async () => {
        const segment = new Segment("worker").end();

        await xray.traceSegment(segment);

        const request = fetch.mock.calls[0][0];
        expect(request.url).toEqual(
          "https://xray.test.amazonaws.com/TraceSegments"
        );
        expect(request.method).toEqual("POST");

        const data = await request.json();
        expect(data).toEqual({
          TraceSegmentDocuments: [
            JSON.stringify({
              name: "worker",
              id: String(segment.id),
              start_time: segment.startTime / 1000,
              end_time: segment.endTime! / 1000,
              annotations: {},
              metadata: {},
              subsegments: [],
              trace_id: String(segment.traceId),
            }),
          ],
        });
      });
    });
  });
});
