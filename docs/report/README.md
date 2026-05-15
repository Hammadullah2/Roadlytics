# Roadlytics Technical Report

This folder contains an IEEE conference style LaTeX report for the Roadlytics
platform.

## Files

- `roadlytics_technical_report.tex`: main LaTeX source

## Recommended compilation

```bash
pdflatex roadlytics_technical_report.tex
bibtex roadlytics_technical_report
pdflatex roadlytics_technical_report.tex
pdflatex roadlytics_technical_report.tex
```

If you do not want bibliography tooling, the report can still usually be built
with:

```bash
pdflatex roadlytics_technical_report.tex
pdflatex roadlytics_technical_report.tex
```

## Notes

- The report uses `IEEEtran` conference format.
- Diagrams are embedded directly with TikZ, so there are no external image
  dependencies for the core architecture figures.
- If you later replace any figure with polished exported graphics, keep the same
  figure captions and labels to avoid breaking references.
