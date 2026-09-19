import argparse
import asyncio
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx

from measurement.db import fetch_job_metrics


async def measure_job(
    client: httpx.AsyncClient,
    job_num: int,
    api_url: str,
    db_dsn: str,
    image_path: str,
) -> dict:
    """measure_job takes the required measurements for a single job."""

    # Read the image file asynchronously.
    path = Path(image_path)
    image_bytes = await asyncio.to_thread(path.read_bytes)

    # Send the image file to the API asynchronously, recording Acknowledgement Latency.
    upload_url = f"{api_url.rstrip('/')}/v1/images"
    post_start = time.perf_counter()
    try:
        response = await client.post(
            upload_url, files={"image": (path.name, image_bytes, "image/jpeg")}
        )
    except httpx.RequestError as e:
        print(f"[Job {job_num}] Network error reaching API at '{upload_url}': {e}")
        return {}
    post_end = time.perf_counter()
    ack_latency_ms = round((post_end - post_start) * 1000, 2)
    if response.status_code != 202:
        print(f"[Job {job_num}] Failed POST upload: Status {response.status_code}")
        return {}

    # Parse the response JSON and extract the job ID and status URL.
    data = response.json()
    public_id = data["job_id"]
    status_url = f"{api_url.rstrip('/')}{data.get('status_url')}"

    # Poll the job until the job is completed or fails, recording Polling Count.
    poll_count = 0
    job_status = data.get("status", "queued")
    while job_status not in ("completed", "failed"):
        await asyncio.sleep(1.0)
        poll_count += 1

        try:
            res = await client.get(status_url)
            if res.status_code == 200:
                job_status = res.json().get("status")
        except httpx.RequestError as e:
            print(f"[Job {job_num}] Polling error at '{status_url}': {e}")
            break

    # Query the database for job metrics, recording Detection Delay.
    client_detected_at = datetime.now(UTC)
    db_data = fetch_job_metrics(public_id, dsn=db_dsn) or {}
    detection_delay_ms = 0.0
    if db_data.get("completed_at"):
        server_completed = db_data["completed_at"]
        delay_sec = (client_detected_at - server_completed).total_seconds()
        detection_delay_ms = round(delay_sec * 1000, 2)

    return {
        "job_num": job_num,
        "public_id": public_id,
        "ack_latency_ms": ack_latency_ms,
        "poll_count": poll_count,
        "queue_wait_ms": db_data.get("queue_wait_ms", 0),
        "processing_duration_ms": db_data.get("processing_duration_ms", 0),
        "job_duration_ms": db_data.get("job_duration_ms", 0),
        "detection_delay_ms": detection_delay_ms,
    }


async def main_async():
    """main_async is the entry point for the measurements tool."""

    # Program Flags
    parser = argparse.ArgumentParser(description="Imagelab Benchmark Suite")
    parser.add_argument(
        "-n", "--count", type=int, default=1, help="Number of concurrent job uploads"
    )
    parser.add_argument(
        "--api-url", type=str, required=True, help="Upload API URL (Required)"
    )
    parser.add_argument(
        "--db-dsn", type=str, required=True, help="PostgreSQL DSN (Required)"
    )
    parser.add_argument(
        "--image-path",
        type=str,
        default="pittsburgh.jpg",
        help="Path to test image file",
    )
    args = parser.parse_args()

    # Parse the image path and ensure it exists.
    image_path = Path(args.image_path)
    if not image_path.exists():
        await asyncio.to_thread(image_path.write_bytes, b"dummy test image bytes")

    # Run the measurement jobs concurrently.
    async with httpx.AsyncClient() as client:
        tasks = [
            # Gather tasks for each job.
            measure_job(client, i + 1, args.api_url, args.db_dsn, str(image_path))
            for i in range(args.count)
        ]
        # Execute all tasks concurrently and gather results.
        results = await asyncio.gather(*tasks)

    # Sort results by job number.
    results.sort(key=lambda x: x.get("job_num", 0))

    # Print header.
    print("=" * 143)
    print(f"Running ImageLab Measurements (Count: {args.count})")
    print("=" * 143)
    fmt = "{:<5} | {:<36} | {:<11} | {:<10} | {:<19} | {:<12} | {:<13} | {:<15}"
    header = fmt.format(
        "Job #",
        "Public ID",
        "Ack Latency",
        "Queue Wait",
        "Processing Duration",
        "Job Duration",
        "Polling Count",
        "Detection Delay",
    )
    print(header)
    print("-" * len(header))

    # Print results.
    for r in results:
        if not r:
            continue
        print(
            fmt.format(
                f"{r['job_num']}",
                str(r["public_id"]),
                f"{r['ack_latency_ms']:.1f}ms",
                f"{r['queue_wait_ms'] / 1000:.2f}s",
                f"{r['processing_duration_ms'] / 1000:.2f}s",
                f"{r['job_duration_ms'] / 1000:.2f}s",
                r["poll_count"],
                f"{r['detection_delay_ms']:.1f}ms",
            )
        )

    print("=" * 143)


def main():
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
