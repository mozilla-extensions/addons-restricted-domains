/* global ChromeUtils, ExtensionAPI, Services */

const { Management } = ChromeUtils.import(
  "resource://gre/modules/Extension.jsm"
);

const DOMAIN = "example.com";
const RESTRICTED_DOMAINS_PREF = "extensions.webextensions.restrictedDomains";

const getRestrictedDomains = () => {
  return Services.prefs.getStringPref(RESTRICTED_DOMAINS_PREF, "").split(",");
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
   * On startup, add a domain to the list of restricted domains. When the
   * add-on is uninstalled, the domain is removed from this list. When the
   * domain is already present in the pref, we do nothing.
   *
   * We also create a pref (only once) to retain whether the domain is already
   * restricted (e.g. user has already added `DOMAIN`) because we don't want to
   * change that during uninstallation of this add-on.
   */
  onStartup() {
    const { extension } = this;

    // This pref is used to retain whether the domain is already restricted.
    // This works because we only have a domain. If we had more, we'd need a
    // better (and likely more complex) solution.
    const alreadyPresentPref = getPrefName(extension.id, "alreadyPresent");

    // Create the "already present" pref when it does not exist.
    if (
      Services.prefs.getPrefType(alreadyPresentPref) ===
      Services.prefs.PREF_INVALID
    ) {
      Services.prefs.setBoolPref(
        alreadyPresentPref,
        getRestrictedDomains().includes(DOMAIN)
      );
    }

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

      // Only remove the domain if it wasn't already present before.
      if (!Services.prefs.getBoolPref(alreadyPresentPref, false)) {
        const restrictedDomains = getRestrictedDomains();

        if (restrictedDomains.includes(DOMAIN)) {
          setRestrictedDomains(
            restrictedDomains.filter(
              (restrictedDomain) => restrictedDomain !== DOMAIN
            )
          );
        }
      }

      Services.prefs.clearUserPref(alreadyPresentPref);
    });
  }

  onShutdown() {
    Services.prefs.removeObserver(
      RESTRICTED_DOMAINS_PREF,
      this.#ensureDomainIsRegistered
    );
  }

  #ensureDomainIsRegistered() {
    const restrictedDomains = getRestrictedDomains();

    if (!restrictedDomains.includes(DOMAIN)) {
      // Add the domain to the list of restricted domain.
      setRestrictedDomains([...restrictedDomains, DOMAIN]);
    }
  }

  getAPI() {
    return {
      addonsRestrictedDomain: {
        getDomain() {
          return DOMAIN;
        },
      },
    };
  }
};
