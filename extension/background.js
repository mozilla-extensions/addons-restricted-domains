const SUMO_PAGE = "https://support.mozilla.org/";

browser.addonsRestrictedDomain.getDomain().then(async (domain) => {
  const matchPattern = `*://${domain}/*`;
  const notificationId = "user-notification";

  // This function is used to notify the user. Once the notification is
  // displayed, the user can click on it to open a SUMO page (for more
  // information).
  const showNotification = () => {
    return browser.notifications.create(notificationId, {
      type: "basic",
      title: browser.i18n.getMessage("notificationTitle"),
      message: browser.i18n.getMessage("notificationMessage", domain),
    });
  };

  // This event listener is called when the user clicks the notification.
  browser.notifications.onClicked.addListener(async (id) => {
    if (id !== notificationId) {
      return;
    }

    // We open the SUMO page in a new tab and, assuming the tab is created, we
    // clear (hide) the notification. If the tab creation failed, likely on
    // macOS because Firefox runs but without any window, we create a new
    // window first, then we clear the notification.
    try {
      await browser.tabs.create({ url: SUMO_PAGE });
    } catch {
      await browser.windows.create({ url: SUMO_PAGE });
    }

    browser.notifications.clear(id);
  });

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
