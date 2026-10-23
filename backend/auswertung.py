from pathlib import Path

import pandas as pd

CSV_PATH = Path(__file__).parent / "Test_Daten3.csv"


def get_chart_data() -> list[dict]:
    df = pd.read_csv(
        CSV_PATH,
        sep=";",
        decimal=",",
        thousands=".",
        encoding="utf-8-sig",
        na_values=["-", ""],
    )

    # Datumsangaben eindeutig interpretieren.
    for column in ["Datum von", "Datum bis"]:
        df[column] = pd.to_datetime(
            df[column],
            format="%d.%m.%Y %H:%M",
            errors="raise",
        )

    # Kürzere Namen für die Energieträger.
    df = df.rename(
        columns=lambda name: name.removesuffix(
            " [MWh] Originalauflösungen"
        )
    )

    energy_columns = [
        column
        for column in df.columns
        if column not in ["Datum von", "Datum bis"]
    ]

    for column in energy_columns:
        df[column] = pd.to_numeric(df[column], errors="raise")

    df = df.sort_values("Datum von")

    result = []

    for row in df.to_dict(orient="records"):
        result.append({
            "date": row["Datum von"].isoformat(),
            "date_to": row["Datum bis"].isoformat(),
            "values": {
                column: (
                    None
                    if pd.isna(row[column])
                    else float(row[column])
                )
                for column in energy_columns
            },
        })

    return result