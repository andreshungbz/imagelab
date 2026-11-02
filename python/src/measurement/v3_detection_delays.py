import json
from datetime import datetime
from pathlib import Path

# ==================================================================================== #
# V3 EXPERIMENT DATA
# ==================================================================================== #

# Resolve the repository root from this module so the command works from any directory.
BASE_DIR = (
    Path(__file__).resolve().parents[3] / "docs" / "v3.0.0" / "experiments" / "raw"
)


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


def process_experiment_runs():
    """process_experiment_runs computes v3 terminal detection delays for each run."""

    results = []

    if not BASE_DIR.exists():
        print(f"V3 experiment directory does not exist: {BASE_DIR}")
        return

    # Iterate through v3 condition folders: A quiet, B real progress, and C frequent updates.
    for condition_dir in sorted(BASE_DIR.iterdir()):
        if not condition_dir.is_dir():
            continue

        condition = condition_dir.name

        # Each condition contains paired long-polling and SSE repetitions.
        for run_dir in sorted(condition_dir.iterdir()):
            if not run_dir.is_dir():
                continue

            run_id = run_dir.name
            server_log = run_dir / "server.log"
            console_log = run_dir / "console.log"

            # Incomplete runs cannot produce a detection-delay row.
            if not (server_log.exists() and console_log.exists()):
                continue

            browser_receipt_time = read_browser_receipt_time(console_log)
            if browser_receipt_time is None:
                continue

            # Parse the terminal commit and observation-read measurement from server.log.
            job_id = "N/A"
            terminal_commit_time = None
            observation_reads = "N/A"

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
                            job_id = log_entry.get("job_id", "N/A")
                            terminal_commit_str = log_entry.get("time")
                            if terminal_commit_str:
                                terminal_commit_time = parse_iso_time(
                                    terminal_commit_str
                                )
                        elif message == "observation query count":
                            observation_reads = log_entry.get(
                                "observation_queries", "N/A"
                            )
            except (OSError, TypeError, ValueError) as error:
                print(f"Error reading {server_log}: {error}")
                continue

            # Calculate detection delay from terminal commit to browser receipt.
            if terminal_commit_time is None:
                continue

            raw_delay_ms = (
                browser_receipt_time - terminal_commit_time
            ).total_seconds() * 1000.0
            delay_ms = round(raw_delay_ms)

            # Extract human-readable timestamp strings for the evidence table.
            commit_str = terminal_commit_time.strftime("%H:%M:%S.%f")[:-3]
            receipt_str = browser_receipt_time.strftime("%H:%M:%S.%f")[:-3]

            results.append(
                {
                    "condition": condition,
                    "run_id": run_id,
                    "job_id": job_id,
                    "commit_time": commit_str,
                    "receipt_time": receipt_str,
                    "delay_ms": delay_ms,
                    "observation_reads": observation_reads,
                }
            )

    # Print the v3 run-by-run detection-delay table.
    print(
        f"{'Condition':<10} | {'Run ID':<16} | {'Job Public ID':<36} | {'Terminal Commit':<15} | {'Browser Receipt':<15} | {'Delay (ms)':<10} | {'Obs Reads':<10}"
    )
    print("-" * 130)

    for result in results:
        observation_reads = str(result["observation_reads"])
        print(
            f"{result['condition']:<10} | {result['run_id']:<16} | {result['job_id']:<36} | {result['commit_time']:<15} | {result['receipt_time']:<15} | {result['delay_ms']:>10d} | {observation_reads:>10}"
        )


def main():
    """main is the entry point for the v3 detection-delay tool."""
    process_experiment_runs()


if __name__ == "__main__":
    main()
