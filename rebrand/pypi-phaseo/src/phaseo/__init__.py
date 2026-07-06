"""Phaseo Python SDK transition import.

The current SDK implementation is still distributed under the ai_stats module
during the package migration. This package provides the new phaseo import path
while preserving the existing SDK surface.
"""

from ai_stats import *  # noqa: F401,F403

try:
    from ai_stats import __version__ as __version__
except ImportError:  # pragma: no cover
    __version__ = "2.0.5"
