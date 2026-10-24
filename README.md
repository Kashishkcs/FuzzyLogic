# Optional original Python / Streamlit edition

The user-provided AI project used `app.py` with `fuzzy_engine.py`, NumPy, pandas, matplotlib, and Streamlit. This folder keeps that implementation available for academic reference and optional Streamlit Community Cloud hosting. The main `index.html` application is the preferred and fully browser-tested deployment.

Small changes to `app.py` relative to the uploaded version:

1. Evaluation now recalculates on every Streamlit slider rerun, fixing an older-result/stale-input mismatch.
2. Each matplotlib figure is closed after `st.pyplot`, avoiding repeated figure accumulation.
3. Library requirements specify broad compatible ranges instead of unbounded newest versions.

This optional UI was syntax-checked but **not browser-tested** in this environment because Streamlit could not be installed here. The fuzzy engine itself was executed and used as the ground truth for 250 JavaScript parity tests.

Run on Windows: `run.bat` (requires a Python installation). Manual: `python -m pip install -r requirements.txt` then `python -m streamlit run app.py`.

If your teacher specifically requires Python/Streamlit, deploy these three files from a separate GitHub repository with Streamlit Community Cloud: `app.py`, `fuzzy_engine.py`, `requirements.txt`.
