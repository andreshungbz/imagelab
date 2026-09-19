from typing import Any

import psycopg
from psycopg.rows import dict_row


def fetch_job_metrics(public_id: str, dsn: str) -> dict[str, Any] | None:
    """fetch_job_metrics queries the v_job_metrics view for server-side job metrics."""
    query = "SELECT * FROM v_job_metrics WHERE public_id = %s;"
    try:
        with psycopg.connect(dsn) as conn:
            cur = conn.cursor(row_factory=dict_row)
            cur.execute(query, (public_id,))
            row = cur.fetchone()
            cur.close()
            return dict(row) if row is not None else None
    except psycopg.Error as e:
        print(f"[DB Error] Database query failed for public_id '{public_id}': {e}")
        return None
