/* global ChromeUtils, ExtensionAPI, Services */

const { Management } = ChromeUtils.import(
  "resource://gre/modules/Extension.jsm"
);

const DOMAINS = ["example.com"];
const RESTRICTED_DOMAINS_PREF = "extensions.webextensions.restrictedDomains";

const getArrayPref = (prefName) => {
  return Services.prefs
    .getStringPref(prefName, "")
    .split(",")
    .filter((value) => value.length);
};

const getRestrictedDomains = () => {
  return getArrayPref(RESTRICTED_DOMAINS_PREF);
};

// Returns a pref name that is scoped to this extension.
const getPrefName = (extensionId, name) => {
  return `extensions.webextensions.${extensionId}.${name}`;
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
   * On startup, add the domains to the list of restricted domains. When the
   * extension is uninstalled, the domains are removed from this list. When the
   * domains are already present in the pref, we do nothing.
   *
   * We also create a pref (only once) to retain whether the domains have
   * already been restricted (e.g. user has already added one or all of the
   * domains in `DOMAINS`) because we don't want to change that during
   * uninstallation of this extension.
   */
  onStartup() {
    const { extension } = this;

    const domainsToPreservePref = getPrefName(
      extension.id,
      "domainsToPreserve"
    );
    // Create the "domainsToPreserve" pref when it does not exist. This pref
    // contains the list of domains in `DOMAINS` that are already present in
    // the restricted domains pref.
    if (
      Services.prefs.getPrefType(domainsToPreservePref) ===
      Services.prefs.PREF_INVALID
    ) {
      Services.prefs.setStringPref(
        domainsToPreservePref,
        [
          ...new Set(
            getRestrictedDomains().filter((domain) => DOMAINS.includes(domain))
          ),
        ].join(",")
      );
    }

    this.#ensureDomainsAreRegistered();

    Services.prefs.addObserver(
      RESTRICTED_DOMAINS_PREF,
      this.#ensureDomainsAreRegistered
    );

    // When the extension is uninstalled, remove the domains, except those that
    // must be preserved.
    Management.on("uninstall", (type, { id }) => {
      if (id !== extension.id) {
        return;
      }

      // We want to remove all the domains in `DOMAINS` that have been added by
      // this extension to the restricted domains pref, except for the domains
      // that were already there.
      const domainsToPreserve = getArrayPref(domainsToPreservePref);
      const domainsToRemove = DOMAINS.filter(
        (domain) => !domainsToPreserve.includes(domain)
      );

      if (domainsToRemove.length > 0) {
        setRestrictedDomains(
          getRestrictedDomains().filter(
            (restrictedDomain) => !domainsToRemove.includes(restrictedDomain)
          )
        );
      }

      Services.prefs.clearUserPref(domainsToPreservePref);
    });
  }

  onShutdown() {
    Services.prefs.removeObserver(
      RESTRICTED_DOMAINS_PREF,
      this.#ensureDomainsAreRegistered
    );
  }

  #ensureDomainsAreRegistered() {
    const restrictedDomains = getRestrictedDomains();

    const domainsToRegister = DOMAINS.filter(
      (domain) => !restrictedDomains.includes(domain)
    );
    if (domainsToRegister.length > 0) {
      // Add the missing domains to the list of restricted domain.
      setRestrictedDomains([...restrictedDomains, ...domainsToRegister]);
    }
  }

  getAPI() {
    return {
      addonsRestrictedDomain: {
        getDomains() {
          return DOMAINS;
        },
      },
    };
  }
};
