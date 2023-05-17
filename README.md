# addons-restricted-domains

## Quick Start

```
$ npm install
$ npm run firefox
```

## Prefs

This extension uses the following prefs:

- `extensions.webextensions.addons-restricted-domains@mozilla.com.disabled`: set
  to `true`, it disables the extension's behavior. This pref does not exist by
  default.
- `extensions.webextensions.addons-restricted-domains@mozilla.com.domainsToPreserve`:
  this _internal_ pref is used to preserve (some of the) domains that have been
  restricted before the extension is started for the first time. This is mainly
  used to avoid changing user configuration when this extension is uninstalled.

## License

This project is released under the Mozilla Public License Version 2.0. See the
bundled [LICENSE](./LICENSE.txt) file for details.
