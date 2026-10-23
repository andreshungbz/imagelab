import json
from datetime import datetime
from pathlib import Path

# Base Directory Path
BASE_DIR = Path("../docs/v2.0.0/experiments/raw")


def parse_iso_time(time_str: str) -> datetime:
    """parse_iso_time parses an ISO 8601 timestamp string into a datetime object."""
    return datetime.fromisoformat(time_str)


def process_experiment_runs():
    """process_experiment_runs aggregates and computes timing measurements across experiment condition runs."""

    results = []

    # Iterate through condition folders (A, B, C1, C2, C3, C3-X).
    for condition_dir in sorted(BASE_DIR.iterdir()):
        if not condition_dir.is_dir():
            continue

        condition = condition_dir.name

        # Iterate through run folders (run_id_01_sp, run_id_02_lp, etc.).
        for run_dir in sorted(condition_dir.iterdir()):
            if not run_dir.is_dir():
                continue

            run_id = run_dir.name
            server_log = run_dir / "server.log"
            console_log = run_dir / "console.log"

            # Ensure necessary log files exist.
            if not (server_log.exists() and console_log.exists()):
                continue

            # Parse console.log for browser receipt time.
            try:
                with open(console_log, "r", encoding="utf-8") as f:
                    console_data = json.load(f)
                    browser_receipt_str = console_data.get("browser_receipt_time")
                    browser_receipt_time = parse_iso_time(browser_receipt_str)
            except (json.JSONDecodeError, OSError) as e:
                print(f"Error reading {console_log}: {e}")
                continue

            # Parse server.log for terminal commit time, job_id, and observation_queries.
            job_id = "N/A"
            terminal_commit_time = None
            observation_reads = "N/A"

            with open(server_log, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line.startswith("{"):
                        continue
                    try:
                        log_entry = json.loads(line)
                        msg = log_entry.get("msg")

                        if msg == "terminal commit":
                            job_id = log_entry.get("job_id", "N/A")
                            terminal_commit_str = log_entry.get("time")
                            terminal_commit_time = parse_iso_time(terminal_commit_str)

                        elif msg == "observation query count":
                            observation_reads = log_entry.get(
                                "observation_queries", "N/A"
                            )

                    except json.JSONDecodeError:
                        continue

            # Calculate detection delay rounded to whole milliseconds.
            if terminal_commit_time and browser_receipt_time:
                raw_delay_ms = (
                    browser_receipt_time - terminal_commit_time
                ).total_seconds() * 1000.0
                delay_ms = round(raw_delay_ms)

                # Extract human-readable time strings (HH:MM:SS.mmm).
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

    # Print table header.
    print(
        f"{'Condition':<10} | {'Run ID':<16} | {'Job Public ID':<36} | {'Terminal Commit':<15} | {'Browser Receipt':<15} | {'Delay (ms)':<10} | {'Obs Reads':<10}"
    )
    print("-" * 130)

    # Print table rows.
    for r in results:
        obs_str = str(r["observation_reads"])
        print(
            f"{r['condition']:<10} | {r['run_id']:<16} | {r['job_id']:<36} | {r['commit_time']:<15} | {r['receipt_time']:<15} | {r['delay_ms']:>10d} | {obs_str:>10}"
        )


def main():
    """main is the entry point for the experiment processing tool."""
    process_experiment_runs()


if __name__ == "__main__":
    main()
