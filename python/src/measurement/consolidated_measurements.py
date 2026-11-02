import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from typing import TypedDict

from measurement.db import fetch_job_metrics

# ==================================================================================== #
# CONSOLIDATED MEASUREMENT PARSER
# ==================================================================================== #

RUN_ID_PATTERN = re.compile(r"run_id_(\d+)")


class ServerMeasurements(TypedDict):
    """ServerMeasurements describes required and optional log-derived values."""

    job_id: str | None
    terminal_commit_time: datetime | None
    observation_reads: int | float | None
    stream_duration_ms: int | float | None
    peak_active_sse_streams: int | float | None


def parse_iso_time(time_str: str) -> datetime:
    """parse_iso_time parses an ISO 8601 timestamp string into a datetime object."""
    return datetime.fromisoformat(time_str)


def read_browser_receipt_time(console_log: Path) -> datetime | None:
    """read_browser_receipt_time returns the terminal snapshot receipt timestamp."""
    try:
        if console_log.stat().st_size == 0:
            return None
        with console_log.open("r", encoding="utf-8") as file:
            console_data = json.load(file)
        browser_receipt_str = console_data.get("browser_receipt_time")
        if not browser_receipt_str:
            return None
        return parse_iso_time(browser_receipt_str)
    except (json.JSONDecodeError, OSError, TypeError, ValueError) as error:
        print(f"Error reading {console_log}: {error}")
        return None


def parse_run_id(run_name: str) -> str:
    """parse_run_id returns only the numeric portion of a run directory name."""
    match = RUN_ID_PATTERN.search(run_name)
    return match.group(1) if match else run_name


def read_server_measurements(server_log: Path) -> ServerMeasurements:
    """read_server_measurements extracts required and optional server measurements."""
    measurements: ServerMeasurements = {
        "job_id": None,
        "terminal_commit_time": None,
        "observation_reads": None,
        "stream_duration_ms": None,
        "peak_active_sse_streams": None,
    }

    try:
        with server_log.open("r", encoding="utf-8") as file:
            for line in file:
                line = line.strip()
                if not line.startswith("{"):
                    continue

                try:
                    log_entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                message = log_entry.get("msg")
                if message == "terminal commit":
                    measurements["job_id"] = log_entry.get("job_id")
                    commit_time = log_entry.get("time")
                    if commit_time:
                        measurements["terminal_commit_time"] = parse_iso_time(
                            commit_time
                        )
                elif message == "observation query count":
                    measurements["observation_reads"] = log_entry.get(
                        "observation_queries"
                    )
                elif message == "sse stream ended":
                    duration = log_entry.get("stream_duration_ms")
                    if isinstance(duration, (int, float)):
                        current_duration = measurements["stream_duration_ms"] or 0
                        measurements["stream_duration_ms"] = current_duration + duration

                    peak = log_entry.get("peak_active_sse_streams")
                    if isinstance(peak, (int, float)):
                        current_peak = measurements["peak_active_sse_streams"] or 0
                        measurements["peak_active_sse_streams"] = max(
                            current_peak, peak
                        )
                elif message == "sse stream started":
                    # The start record also carries the peak when no end record exists.
                    peak = log_entry.get("peak_active_sse_streams")
                    if isinstance(peak, (int, float)):
                        current_peak = measurements["peak_active_sse_streams"] or 0
                        measurements["peak_active_sse_streams"] = max(
                            current_peak, peak
                        )
    except (OSError, TypeError, ValueError) as error:
        print(f"Error reading {server_log}: {error}")

    return measurements


def process_experiment_runs(base_dir: Path, db_dsn: str) -> None:
    """process_experiment_runs prints consolidated v2 or v3 run measurements."""
    results = []

    # uv runs this package from ./python; also accept paths written from the repository root.
    if not base_dir.is_absolute() and not base_dir.exists():
        repository_root = Path(__file__).resolve().parents[3]
        base_dir = repository_root / base_dir

    if not base_dir.exists():
        print(f"Experiment directory does not exist: {base_dir}")
        return

    for condition_dir in sorted(base_dir.iterdir()):
        if not condition_dir.is_dir():
            continue

        for run_dir in sorted(condition_dir.iterdir()):
            if not run_dir.is_dir():
                continue

            server_log = run_dir / "server.log"
            console_log = run_dir / "console.log"
            if not (server_log.exists() and console_log.exists()):
                continue

            browser_receipt_time = read_browser_receipt_time(console_log)
            measurements = read_server_measurements(server_log)
            terminal_commit_time = measurements["terminal_commit_time"]
            if browser_receipt_time is None or terminal_commit_time is None:
                continue

            job_id = measurements["job_id"]
            database_metrics = (
                fetch_job_metrics(job_id, dsn=db_dsn) if job_id is not None else None
            )
            processing_duration_ms = (
                database_metrics.get("processing_duration_ms")
                if database_metrics is not None
                else None
            )

            delay_ms = round(
                (browser_receipt_time - terminal_commit_time).total_seconds() * 1000
            )
            results.append(
                {
                    "condition": condition_dir.name,
                    "run_id": parse_run_id(run_dir.name),
                    "processing_duration_ms": processing_duration_ms,
                    "delay_ms": delay_ms,
                    "observation_reads": measurements["observation_reads"],
                    "stream_duration_ms": measurements["stream_duration_ms"],
                    "peak_active_sse_streams": measurements["peak_active_sse_streams"],
                }
            )

    print(
        f"{'Condition':<10} | {'Run':>3} | {'Processing (ms)':>15} | "
        f"{'Detection (ms)':>14} | "
        f"{'Obs Reads':>9} | {'SSE Duration (ms)':>17} | {'Peak SSE':>8}"
    )
    print("-" * 98)
    for result in results:
        processing_duration = (
            str(result["processing_duration_ms"])
            if result["processing_duration_ms"] is not None
            else "-"
        )
        observation_reads = (
            str(result["observation_reads"])
            if result["observation_reads"] is not None
            else "-"
        )
        stream_duration = (
            str(result["stream_duration_ms"])
            if result["stream_duration_ms"] is not None
            else "-"
        )
        peak_streams = (
            str(result["peak_active_sse_streams"])
            if result["peak_active_sse_streams"] is not None
            else "-"
        )
        print(
            f"{result['condition']:<10} | {result['run_id']:>3} | "
            f"{processing_duration:>15} | {result['delay_ms']:>14} | "
            f"{observation_reads:>9} | "
            f"{stream_duration:>17} | {peak_streams:>8}"
        )


def main() -> None:
    """main parses the evidence directory and runs the consolidated measurement parser."""
    parser = argparse.ArgumentParser(description="Show ImageLab measurement results.")
    parser.add_argument(
        "base_dir",
        type=Path,
        help="Path to an experiments/raw directory, such as docs/v2.0.0/experiments/raw",
    )
    parser.add_argument(
        "--db-dsn",
        required=True,
        help="PostgreSQL DSN used to query processing duration from v_job_metrics",
    )
    args = parser.parse_args()
    process_experiment_runs(args.base_dir, args.db_dsn)


if __name__ == "__main__":
    main()
