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
  const prefValue = [...new Set(domains)].join(",");

  // This pref can be locked by an Enterprise policy. If that's the case, we
  // update the pref like the enterprise policy does (but without using
  // `setAndLockPref()` to avoid a module import).
  if (Services.prefs.prefIsLocked(RESTRICTED_DOMAINS_PREF)) {
    Services.prefs.unlockPref(RESTRICTED_DOMAINS_PREF);
    Services.prefs
      .getDefaultBranch("")
      .setStringPref(RESTRICTED_DOMAINS_PREF, prefValue);
    Services.prefs.lockPref(RESTRICTED_DOMAINS_PREF);
    return;
  }

  // Otherwise, we just update the pref as usual.
  Services.prefs.setStringPref(RESTRICTED_DOMAINS_PREF, prefValue);
};

this.addonsRestrictedDomain = class extends ExtensionAPI {
  /**
   * On startup, add a domain to the list of restricted domains. When the
   * add-on is uninstalled, the domain is removed from this list. When the
   * domain is already present in the pref, we do nothing.
   */
  onStartup() {
    const { extension } = this;

    this.#ensureDomainIsRegistered();

    Services.prefs.addObserver(
      RESTRICTED_DOMAINS_PREF,
      this.#ensureDomainIsRegistered
    );

    // When the add-on is uninstalled, remove the domain.
    Management.on("uninstall", async (type, { id }) => {
      if (id !== extension.id) {
        return;
      }

      const restrictedDomains = getRestrictedDomains();

      if (restrictedDomains.includes(DOMAIN)) {
        setRestrictedDomains(
          restrictedDomains.filter(
            (restrictedDomain) => restrictedDomain !== DOMAIN
          )
        );
      }
    });
  }

  onShutdown() {
    Services.prefs.removeObserver(
      RESTRICTED_DOMAINS_PREF,
      this.#ensureDomainIsRegistered
    );
  }

  #ensureDomainIsRegistered() {
    const { extension } = this;

    const restrictedDomains = getRestrictedDomains();

    if (!restrictedDomains.includes(DOMAIN)) {
      // Add the domain to the list of restricted domain.
      setRestrictedDomains([...restrictedDomains, DOMAIN]);
    }
  }

  getAPI(context) {
    return {
      addonsRestrictedDomain: {
        getDomain() {
          return DOMAIN;
        },
      },
    };
  }
};
