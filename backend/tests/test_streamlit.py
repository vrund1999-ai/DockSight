from pathlib import Path

import pytest

pytest.importorskip("streamlit")
from streamlit.testing.v1 import AppTest  # noqa: E402

APP = str(Path(__file__).resolve().parent.parent / "streamlit_app.py")


def test_model_lab_renders_without_errors(artifact):
    at = AppTest.from_file(APP, default_timeout=60).run()
    assert not at.exception
    assert at.title[0].value == "DockSight Model Lab"
    assert [m.label for m in at.metric][:2] == ["Holdout ROC AUC", "Log loss"]


def test_what_if_higher_rent_lowers_renewal_odds(artifact):
    at = AppTest.from_file(APP, default_timeout=60).run()
    rent = at.slider[0]
    assert rent.label.startswith("Rent")

    rent.set_value(rent.min).run()
    cheap = float(at.metric[-1].value.rstrip("%"))
    at.slider[0].set_value(at.slider[0].max).run()
    pricey = float(at.metric[-1].value.rstrip("%"))

    assert not at.exception
    assert pricey < cheap
