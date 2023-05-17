/* global URL */
const SUMO_PAGE = "https://support.mozilla.org/";

// A list of domains for which the user has already been notified.
const DOMAINS_ALREADY_NOTIFIED = [];

// Returns a domain (host) for a given tab object.
const getDomainForTab = (tab) => {
  return new URL(tab.url).hostname;
};

// This function is used to notify the user about add-ons blocked on a given
// domain. Once the notification is displayed, the user can click it to open a
// SUMO page (for more information).
const showNotification = (domain) => {
  if (DOMAINS_ALREADY_NOTIFIED.includes(domain)) {
    return;
  }

  DOMAINS_ALREADY_NOTIFIED.push(domain);

  return browser.notifications.create(`user-notification-${domain}`, {
    type: "basic",
    title: browser.i18n.getMessage("notificationTitle"),
    message: browser.i18n.getMessage("notificationMessage", domain),
  });
};

// This event listener is called when the user clicks the notification.
browser.notifications.onClicked.addListener(async (id) => {
  // We open the SUMO page in a new tab and, assuming the tab is created, we
  // clear (hide) the notification. If the tab creation failed, likely on macOS
  // because Firefox runs but without any window, we create a new window first,
  // then we clear the notification.
  try {
    await browser.tabs.create({ url: SUMO_PAGE });
  } catch {
    await browser.windows.create({ url: SUMO_PAGE });
  }

  browser.notifications.clear(id);
});

browser.addonsRestrictedDomains.getDomains().then(async (DOMAINS) => {
  const isDisabled = await browser.addonsRestrictedDomains.isDisabled();
  const matchPatterns = DOMAINS.map((domain) => `*://${domain}/*`);

  const notifyOnExistingTabs = async () => {
    // Look at the existing tabs in case any of the restricted domains is
    // already open. If there are tabs, we show a notification for each domain.
    const tabs = await browser.tabs.query({ url: matchPatterns });

    if (tabs.length) {
      // Extract a list of unique domains for all the tabs that have been
      // retrieved, and then show a notification for each domain.
      const domainsOpenInTab = [...new Set(tabs.map(getDomainForTab))];
      await Promise.all(
        domainsOpenInTab.map((domain) => showNotification(domain))
      );
    }
  };

  if (!isDisabled) {
    await notifyOnExistingTabs();
  }

  // Monitor new tabs.
  browser.tabs.onUpdated.addListener(
    async (tabId, changeInfo, tab) => {
      if (
        tab.status !== "complete" ||
        // We don't do anything when the extension is disabled.
        (await browser.addonsRestrictedDomains.isDisabled())
      ) {
        return;
      }

      await showNotification(getDomainForTab(tab));
    },
    {
      urls: matchPatterns,
      properties: ["status"],
    }
  );

  // When the extension is re-enabled, we should notify users again.
  browser.addonsRestrictedDomains.onEnabled.addListener(async () => {
    await notifyOnExistingTabs();
  });
});
