browser.addonsRestrictedDomain.getDomain().then(async (domain) => {
  const matchPattern = `*://${domain}/*`;

  const showNotification = () => {
    return browser.notifications.create({
      type: "basic",
      title: browser.i18n.getMessage("notificationTitle"),
      message: browser.i18n.getMessage("notificationMessage", domain),
    });
  };

  // Look at the existing tabs in case the target domain is already open. If
  // there are tabs, we show the notification and then we are done. Otherwise,
  // we register a listener to monitor future tabs.
  const tabs = await browser.tabs.query({ url: matchPattern });

  if (tabs.length) {
    await showNotification();
    return;
  }

  const onTabUpdated = async (tabId, changeInfo, tab) => {
    if (tab.status !== "complete") {
      return;
    }

    await showNotification();
    // At this point we don't need the listener since we are not going to
    // notify the user again in the same browsing session.
    browser.tabs.onUpdated.removeListener(onTabUpdated);
  };

  browser.tabs.onUpdated.addListener(onTabUpdated, {
    urls: [matchPattern],
    properties: ["status"],
  });
});
