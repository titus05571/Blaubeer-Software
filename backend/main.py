from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from auswertung import get_chart_data

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


class EnergyInterval(BaseModel):
    date: datetime
    date_to: datetime
    values: dict[str, float | None]


@app.get("/api/chart-data", response_model=list[EnergyInterval])
def chart_data():
    return get_chart_data()