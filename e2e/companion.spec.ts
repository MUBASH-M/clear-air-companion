import { expect, test } from "@playwright/test";

const MOCK_HOURS = Array.from({ length: 48 }, (_, i) => {
  const day = i < 24 ? "2026-11-26" : "2026-11-27";
  return `${day}T${String(i % 24).padStart(2, "0")}:00`;
});

test.beforeEach(async ({ page }) => {
  // Deterministic external network stubs so E2E tests are fast, offline-safe, and reliable in CI
  await page.route("https://get.geojs.io/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        city: "New Delhi",
        region: "Delhi",
        country: "India",
        latitude: 28.6139,
        longitude: 77.209,
      }),
    }),
  );

  await page.route("https://air-quality-api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    if (url.includes(",")) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          Array.from({ length: 9 }, (_, i) => ({
            current: { pm2_5: 85 + i * 6, pm10: 140 + i * 8, nitrogen_dioxide: 32 },
          })),
        ),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { time: "2026-11-27T08:00", pm2_5: 108, pm10: 192, nitrogen_dioxide: 44 },
        hourly: {
          time: MOCK_HOURS,
          pm2_5: MOCK_HOURS.map((_, i) => (i % 24 === 14 ? 65 : 108)),
          pm10: MOCK_HOURS.map((_, i) => (i % 24 === 14 ? 110 : 192)),
        },
      }),
    });
  });

  await page.route("https://api.open-meteo.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        current: { temperature_2m: 22, relative_humidity_2m: 58, wind_speed_10m: 5.5 },
      }),
    }),
  );

  await page.route("**/api/ask", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        text: "- Wear a fitted N95 outdoors today.\n- Keep windows closed during peak hours.",
        sources: [],
        webSources: [{ title: "CPCB Air Bulletin", uri: "https://cpcb.nic.in" }],
        groundingUsed: "search",
      }),
    }),
  );
});

test.describe("Clear Air Companion E2E user journeys", () => {
  test("covers location selection, daily plan interaction, profile changes, map exploration, assistant, Hindi switch, emergency safety, and privacy deletion", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Initial location flow & AQI dashboard verification
    await expect(page.getByTestId("metric-aqi")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("card-daily-plan")).toBeVisible();

    await page.getByTestId("button-location").click();
    await page.getByTestId("option-place-Jaipur").click();
    await expect(page.getByTestId("button-location")).toContainText("Jaipur");

    // 2. Daily plan interaction
    const firstDoneButton = page.locator('[data-testid^="button-done-"]').first();
    await expect(firstDoneButton).toBeVisible();
    await firstDoneButton.click();
    await expect(firstDoneButton).toHaveAttribute("aria-pressed", "true");

    // 3. Profile changes adapt household sensitivity
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("switch-children").click();
    await expect(page.getByTestId("card-privacy-disclosure")).toBeVisible();

    // 4. Map exploration tab
    await page.getByTestId("tab-map").click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // 5. AI assistant grounded query + deterministic emergency 112 safety response
    await page.getByTestId("tab-ask").click();
    const chatInput = page.getByTestId("input-chat");
    await chatInput.fill("What are the latest GRAP rules today?");
    await page.getByTestId("button-send").click();
    await expect(page.getByText("Wear a fitted N95 outdoors today.")).toBeVisible();

    // Emergency 112 deterministic safety response (client-side, instant)
    await chatInput.fill("My grandfather has chest pain and blue lips");
    await page.getByTestId("button-send").click();
    await expect(page.getByRole("alert").filter({ hasText: "112" })).toBeVisible();

    // 6. Hindi / English language switching
    await page.getByTestId("button-language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "hi");
    await expect(page.getByTestId("tab-today")).toContainText("आज");
    await page.getByTestId("button-language").click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    // 7. Privacy deletion removes profile, actions, and chat state
    await page.getByTestId("tab-profile").click();
    await page.getByTestId("button-delete-data").click();
    await page.getByTestId("button-confirm-delete").click();
    await expect(page.getByText("Logged actions: 0")).toBeVisible();
    await expect(page.getByText("Chat messages: 0")).toBeVisible();
  });
});
