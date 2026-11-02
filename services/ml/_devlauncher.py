"""The dev credential, in one place, for the things that LAUNCH the service rather than are it.

`echo_ml.config.Settings.ml_token` defaults to "" and `_auth` refuses when it is empty, so a
deployment that does not set `ML_SERVICE_TOKEN` fails closed with nothing to configure — which is
the point, because the literal below used to BE that default and is committed at `.env.example:27`.
Anyone could read it out of this repository and present it to a production `GET /persona/{uid}` or
`DELETE /user/{uid}`.

A local checkout must still run with no keys, which is the property C39 kept for the web tier's dev
key. So the literal moves to the launchers: `run.sh` exports it, `conftest.py` and the walkthrough
scripts import this. One copy, and it is on the outside of the boundary rather than inside it.

`setdefault`, never `environ[...] = `: a run that exports a real token keeps it.
"""

import os

DEV_ML_TOKEN = "dev-ml-token-change-me"

os.environ.setdefault("ML_SERVICE_TOKEN", DEV_ML_TOKEN)
