/* global ExtensionAPI, ExtensionCommon, Services */

const DOMAINS = ["example.com", "example.org"];
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

this.addonsRestrictedDomains = class extends ExtensionAPI {
  #onEnabledListeners = new Set();

  /**
   * On startup, and assuming the user hasn't disabled the extension, we add
   * the domains to the list of restricted domains. When the extension is
   * uninstalled, the domains are removed from this list. When the domains are
   * already present in the restricted domains pref, we do nothing.
   *
   * We also create a pref (only once) to retain whether the domains have
   * already been restricted (e.g. user has already added one or all of the
   * domains in `DOMAINS`) because we don't want to change that during
   * uninstallation of this extension.
   */
  onStartup() {
    this.#enable();

    Services.prefs.addObserver(RESTRICTED_DOMAINS_PREF, this);
    Services.prefs.addObserver(this.#disabledPrefName, this);
  }

  onShutdown() {
    Services.prefs.removeObserver(RESTRICTED_DOMAINS_PREF, this);
    Services.prefs.removeObserver(this.#disabledPrefName, this);

    this.#disable();

    Services.prefs.clearUserPref(this.#domainsToPreservePrefName);
    this.#onEnabledListeners.clear();
  }

  observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed": {
        switch (data) {
          case RESTRICTED_DOMAINS_PREF:
            if (!this.#isDisabled) {
              this.#ensureDomainsAreRegistered();
            }
            break;

          case this.#disabledPrefName:
            if (this.#isDisabled) {
              this.#disable();
            } else {
              this.#enable();
              this.#emitEnableEvent();
            }

            break;
        }
        break;
      }
    }
  }

  #emitEnableEvent() {
    try {
      for (const listener of this.#onEnabledListeners) {
        listener();
      }
    } catch {
      // Ignoring unexpected errors raised when calling the listeners.
    }
  }

  #enable() {
    if (this.#isDisabled) {
      return;
    }

    // Create the "domainsToPreserve" pref when it does not exist. This pref
    // contains the list of domains in `DOMAINS` that are already present in
    // the restricted domains pref.
    if (this.#shouldCreateDomainsToPreservePref) {
      Services.prefs.setStringPref(
        this.#domainsToPreservePrefName,
        [
          ...new Set(
            getRestrictedDomains().filter((domain) => DOMAINS.includes(domain))
          ),
        ].join(",")
      );
    }

    this.#ensureDomainsAreRegistered();
  }

  #disable() {
    // In most cases, the "domainsToPreserve" pref should have been created,
    // unless we installed the extension for the first time and the "disabled"
    // pref was already present and set to `true`. This scenario would prevent
    // `#enable()` to ever be called on startup, and therefore we need to
    // account for that when we disable the extension here.
    if (this.#shouldCreateDomainsToPreservePref) {
      return;
    }

    // We want to remove all the domains in `DOMAINS` that have been added by
    // this extension to the restricted domains pref, except for the domains
    // that were already there.
    const domainsToPreserve = getArrayPref(this.#domainsToPreservePrefName);
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

  get #isDisabled() {
    return Services.prefs.getBoolPref(this.#disabledPrefName, false);
  }

  get #shouldCreateDomainsToPreservePref() {
    return (
      Services.prefs.getPrefType(this.#domainsToPreservePrefName) ===
      Services.prefs.PREF_INVALID
    );
  }

  get #domainsToPreservePrefName() {
    return getPrefName(this.extension.id, "domainsToPreserve");
  }

  get #disabledPrefName() {
    return getPrefName(this.extension.id, "disabled");
  }

  getAPI(context) {
    const self = this;

    return {
      addonsRestrictedDomains: {
        getDomains() {
          return DOMAINS;
        },
        isDisabled() {
          return self.#isDisabled;
        },
        onEnabled: new ExtensionCommon.EventManager({
          context,
          name: "addonsRestrictedDomains.onEnabled",
          register: (fire) => {
            let listener = () => fire.async();
            self.#onEnabledListeners.add(listener);
            return () => self.#onEnabledListeners.delete(listener);
          },
        }).api(),
      },
    };
  }
};
