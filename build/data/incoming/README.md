# Incoming drop-zone (demo)

This folder shows how a **Folder / drop-zone** source works. In a live deployment,
new documents land here (from an SFTP push, a shared drive, or a manual upload) and
the tool ingests them on the next scan.

Two sample files are included so you can see the expected shape:

- `INV-DEMO-9001.xml` — a supplier invoice (Model A, net price on the line)
- `DN-DEMO-9001-01.xml` — a delivery note for that invoice (with a `deliveryStatus`)

Drop additional `*.xml` (invoice / delivery note) or `*.csv` (RECADV receipt) files
here following the same structure and they will appear in the tool.
