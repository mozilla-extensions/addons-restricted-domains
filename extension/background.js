/* global URL */
const SUMO_PAGE = "https://support.mozilla.org/";

// Returns a domain (host) for a given tab object.
const getDomainForTab = (tab) => {
  return new URL(tab.url).hostname;
};

// This function is used to notify the user about add-ons blocked on a given
// domain. Once the notification is displayed, the user can click it to open a
// SUMO page (for more information).
const showNotification = (domain) => {
  return browser.notifications.create(`user-notification-${domain}`, {
    type: "basic",
    title: browser.i18n.getMessage("notificationTitle"),
    message: browser.i18n.getMessage("notificationMessage", domain),
  });
};

// A list of domains for which the user has already been notified.
const DOMAINS_ALREADY_NOTIFIED = [];

browser.addonsRestrictedDomains.getDomains().then(async (DOMAINS) => {
  // This event listener is called when the user clicks the notification.
  browser.notifications.onClicked.addListener(async (id) => {
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

  // Look at the existing tabs in case any of the restricted domains is already
  // open. If there are tabs, we show a notification for each domain.
  let matchPatterns = DOMAINS.map((domain) => `*://${domain}/*`);
  const tabs = await browser.tabs.query({ url: matchPatterns });

  if (tabs.length) {
    // Extract a list of unique domains for all the tabs that have been
    // retrieved, and then show a notification for each domain.
    const domainsOpenInTab = [...new Set(tabs.map(getDomainForTab))];
    await Promise.all(
      domainsOpenInTab.map((domain) => showNotification(domain))
    );

    // Let's also update the list of match patterns to not monitor the domains
    // already open in tabs. We do not want to show another notification for
    // the same domain.
    matchPatterns = DOMAINS.filter(
      (domain) => !domainsOpenInTab.includes(domain)
    ).map((domain) => `*://${domain}/*`);
  }

  // Monitor new tabs.
  browser.tabs.onUpdated.addListener(
    async (tabId, changeInfo, tab) => {
      if (tab.status !== "complete") {
        return;
      }

      const domain = getDomainForTab(tab);

      if (!DOMAINS_ALREADY_NOTIFIED.includes(domain)) {
        DOMAINS_ALREADY_NOTIFIED.push(domain);
        await showNotification(domain);
      }
    },
    {
      urls: matchPatterns,
      properties: ["status"],
    }
  );
});
