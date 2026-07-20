async (page) => {
  const ids = [
    "DS68AeIExRb",
    "DRea4XAEvF7",
    "DS676nVE3Qk",
    "DTw8TEqkT29",
    "DRpJv8qkuo7",
    "DZHxa8fEn8_",
    "DQRec_ND4pu",
    "DSbfTRjEsg2",
  ];
  const results = [];
  for (const id of ids) {
    await page.goto(`https://www.instagram.com/p/${id}/`);
    await page.waitForTimeout(1800);
    const body = await page.locator("body").innerText();
    const likeMatch = body.match(/좋아요\s+([\d,.만천]+)개/);
    const publishedAt = await page.locator("time").last().getAttribute("datetime").catch(() => null);
    results.push({
      id,
      url: page.url(),
      likes: likeMatch?.[1] ?? null,
      publishedAt,
      text: body.slice(-1800),
    });
  }
  return results;
}
