/* global ChromeUtils, ExtensionAPI, Services */

const { Management } = ChromeUtils.import(
  "resource://gre/modules/Extension.jsm"
);

const DOMAIN = "example.com";
const RESTRICTED_DOMAINS_PREF = "extensions.webextensions.restrictedDomains";

const getRestrictedDomains = () => {
  return Services.prefs.getStringPref(RESTRICTED_DOMAINS_PREF, "").split(",");
};

const setRestrictedDomains = (domains) => {
  // Make sure we store a unique list of restricted domains.
  Services.prefs.setStringPref(
    RESTRICTED_DOMAINS_PREF,
    [...new Set(domains)].join(",")
  );
};

this.addonsRestrictedDomain = class extends ExtensionAPI {
  /**
   * On startup, add a domain to the list of restricted domains. When the
   * add-on is uninstalled, the domain is removed from this list. When the
   * domain is already present in the pref, we do nothing.
   */
  onStartup() {
    const { extension } = this;

    const restrictedDomains = getRestrictedDomains();

    if (!restrictedDomains.includes(DOMAIN)) {
      // Add the domain to the list of restricted domain.
      setRestrictedDomains([...restrictedDomains, DOMAIN]);
    }

    // When the add-on is uninstalled, remove the domain.
    Management.on("uninstall", async (type, { id }) => {
      if (id !== extension.id) {
        return;
      }

      if (restrictedDomains.includes(DOMAIN)) {
        setRestrictedDomains(
          restrictedDomains.filter(
            (restrictedDomain) => restrictedDomain !== DOMAIN
          )
        );
      }
    });
  }

  getAPI(context) {
    return {
      addonsRestrictedDomain: {},
    };
  }
};
