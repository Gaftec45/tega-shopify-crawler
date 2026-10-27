
const { chromium } = require("playwright");
const dns = require("node:dns").promises;
const net = require("node:net");

const isPrivateIPv4 = (ip) => {
  const parts = ip.split(".").map(Number);

  if (parts.length !== 4 || parts.some((n) => n < 0 || n > 255)) {
    return true;
  }

  return (
    parts[0] === 0 ||
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] >= 224 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
};

const isPublicAddress = (ip) => {
  if (net.isIPv4(ip)) return !isPrivateIPv4(ip);

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    return (
      normalized.startsWith("2001:") ||
      normalized.startsWith("2600:") ||
      normalized.startsWith("2a00:") ||
      normalized.startsWith("2a01:")
    );
  }

  return false;
};

const validateStoreUrl = async (value) => {
  const url = new URL(value);

  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname ||
    url.hostname === "localhost" ||
    net.isIP(url.hostname)
  ) {
    throw new Error("Invalid public HTTPS storefront URL");
  }

  const records = await dns.lookup(url.hostname, { all: true });

  if (!records.length || records.some((record) => !isPublicAddress(record.address))) {
    throw new Error("Storefront hostname does not resolve exclusively to allowed public addresses");
  }

  return url;
};

const scanShopifyStore = async (storeUrl) => {
  const store = await validateStoreUrl(storeUrl);
  const origin = store.origin;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Keep browser requests on the verified storefront origin.
    await page.route("**/*", async (route) => {
      try {
        const requestUrl = new URL(route.request().url());

        if (
          requestUrl.origin !== origin ||
          requestUrl.protocol !== "https:"
        ) {
          return route.abort();
        }

        return route.continue();
      } catch {
        return route.abort();
      }
    });

    await page.goto(origin, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });

    const links = await page.locator('a[href*="/products/"]').evaluateAll(
      (anchors) =>
        [...new Set(
          anchors
            .map((anchor) => anchor.href)
            .filter((href) => {
              try {
                return (
                  new URL(href).origin === window.location.origin &&
                  /\/products\/[^/?#]+/.test(new URL(href).pathname)
                );
              } catch {
                return false;
              }
            })
        )].slice(0, 30)
    );

    const products = [];

    for (const productUrl of links) {
      const productPage = await context.newPage();

      try {
        await productPage.goto(productUrl, {
          waitUntil: "domcontentloaded",
          timeout: 15000,
        });

        const product = await productPage.evaluate(() => {
          const meta = (selector) =>
            document.querySelector(selector)?.content?.trim() || "";

          const title =
            meta('meta[property="og:title"]') ||
            document.querySelector("h1")?.textContent?.trim() ||
            document.title;

          const rawPrice =
            meta('meta[property="product:price:amount"]') ||
            meta('meta[property="og:price:amount"]');

          const currency =
            meta('meta[property="product:price:currency"]') ||
            meta('meta[property="og:price:currency"]');

          const parsedPrice = Number(rawPrice);

          return {
            title: title.slice(0, 300),
            price:
              rawPrice && Number.isFinite(parsedPrice)
                ? parsedPrice
                : null,
            currency: currency || null,
          };
        });

        if (product.title) {
          products.push({
            ...product,
            productUrl,
          });
        }
      } catch (error) {
        console.warn("Product page scan failed:", productUrl, error.message);
      } finally {
        await productPage.close();
      }
    }

    await context.close();

    return {
      storeUrl: origin,
      products,
      productCount: products.length,
    };
  } finally {
    await browser.close();
  }
};

module.exports = { scanShopifyStore };