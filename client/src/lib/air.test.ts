import test from "node:test";
import assert from "node:assert/strict";
import { categoryFor, indiaAqi, resolveCurrentLocation } from "./air";

test("resolveCurrentLocation uses browser geolocation and rounds coordinates when granted", async () => {
  let ipCalled = false;
  const place = await resolveCurrentLocation("en", {
    getPermission: async () => "granted",
    getPosition: async () => ({ latitude: 12.97159, longitude: 77.59456 }),
    reverseGeocode: async () => ({ name: "Bengaluru", region: "Karnataka, India" }),
    locateByIp: async () => {
      ipCalled = true;
      return null;
    },
  });

  assert.equal(ipCalled, false);
  assert.deepEqual(place, {
    name: "Bengaluru",
    region: "Karnataka, India",
    lat: 12.97,
    lon: 77.59,
    approx: "gps",
  });
});

test("resolveCurrentLocation skips browser geolocation when permission is denied and uses IP location", async () => {
  let positionCalled = false;
  const place = await resolveCurrentLocation("en", {
    getPermission: async () => "denied",
    getPosition: async () => {
      positionCalled = true;
      return { latitude: 0, longitude: 0 };
    },
    reverseGeocode: async () => ({}),
    locateByIp: async () => ({
      name: "Mumbai",
      region: "Maharashtra, India",
      lat: 19.08,
      lon: 72.88,
      approx: "ip",
    }),
  });

  assert.equal(positionCalled, false);
  assert.equal(place.name, "Mumbai");
  assert.equal(place.approx, "ip");
});

test("resolveCurrentLocation falls back to IP location when browser geolocation fails", async () => {
  const place = await resolveCurrentLocation("hi", {
    getPermission: async () => "prompt",
    getPosition: async () => {
      throw new Error("Timeout");
    },
    reverseGeocode: async () => ({}),
    locateByIp: async () => ({
      name: "Pune",
      region: "Maharashtra, India",
      lat: 18.52,
      lon: 73.86,
      approx: "ip",
    }),
  });

  assert.equal(place.name, "Pune");
  assert.equal(place.approx, "ip");
});

test("resolveCurrentLocation throws instead of falling back to a hardcoded default city", async () => {
  await assert.rejects(
    () =>
      resolveCurrentLocation("en", {
        getPermission: async () => "prompt",
        getPosition: async () => {
          throw new Error("Unavailable");
        },
        reverseGeocode: async () => ({}),
        locateByIp: async () => null,
      }),
    /Could not determine location/,
  );
});

test("indiaAqi and categoryFor compute CPCB categories accurately", () => {
  const { aqi, dominant } = indiaAqi(18, 30);
  assert.equal(aqi, 30);
  assert.equal(dominant, "PM2.5");
  assert.equal(categoryFor(aqi), "good");
  assert.equal(categoryFor(350), "very_poor");
});
