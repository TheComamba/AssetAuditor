# Asset Auditor

## About

Asset Auditor is a module for [Foundry Virtual Tabletop](https://foundryvtt.com/). The idea arose because I kept wondering why my music playlists would stop playing all the time. At some point I noticed that they do so once they try to load a file that doesn't exists. Checking all files by hand is a pain, though. So here we are.

## Usage

TODO

## Contributing

TODO

## Manual Installation

To manually install Asset Auditor (e.g. for development), copy the src/ folder of this repository to the {userData}/Data/modules/ folder of Foundry, and then rename it to 'asset_auditor' (the id declared in module.json).

On POSIX compliant operating systems like Linux and Mac you can alternatively use a symbolic link. It can be created via e.g.

```bash
ln -s {folder containing git repo}/AssetAuditor/src {Foundry user data}/Data/modules/asset_auditor
```

## License

This software is distributed under the [MIT](https://choosealicense.com/licenses/mit/) license. In a nutshell this means that all code is made public, and you are free to use it without any charge.
