# Security policy

SatsRecord is under active development. There is no supported production release yet. Live payment detection, historical exchange rates and the settlement worker are unfinished. Do not rely on this version for live donation operations.

## Reporting a vulnerability

Email **hello@satsrecord.org** with the subject **SatsRecord security report**. Please report vulnerabilities privately rather than opening a public issue or pull request containing exploit details.

Include the affected commit or version, a description of the impact, and steps to reproduce using a local installation and fictional data. Do not include real donor data, credentials, seed phrases or private keys. If sensitive evidence is necessary, ask how to share it securely first.

Please use your own local instance for testing. Do not test against charities, donors or the hosted service without prior permission.

## Updates

Security fixes are made on the main branch during development; older commits do not have a separate maintenance track. Check the current source and deployment guidance before updating. Back up the database and preserve encryption and index keys across upgrades.
