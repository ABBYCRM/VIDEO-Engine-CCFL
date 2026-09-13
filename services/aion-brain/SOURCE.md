Aion-Brain vendored into VIDEO-Engine-CCFL.

Snapshot of https://github.com/ABBYCRM/Aion-Brain
Pin: cd554517671e776c82c29743825fbf8d9687d9fb (main, gateway v0.1.24)
Verified: 2026-09-13

This folder is VIDEO's runtime copy. Production must not clone or call
the separate Aion-Brain GitHub repo. That repo stays intact — it is the
brain for another system.

VIDEO must not call the shared DigitalOcean app aion-brain
(https://aion-brain-6iptg.ondigitalocean.app). Leave that app running.
Disconnect VIDEO from it only.
