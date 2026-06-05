"""Async worker queue for background inference jobs."""

from __future__ import annotations

import asyncio
import logging
from typing import List, Optional

from ..services.jobs import JobProcessor

logger = logging.getLogger(__name__)


class WorkerService:
    def __init__(self, concurrency: int, processor: JobProcessor) -> None:
        self.concurrency = max(1, concurrency)
        self.processor = processor
        self.queue: asyncio.Queue[Optional[str]] = asyncio.Queue()
        self.tasks: List[asyncio.Task[None]] = []

    async def start(self) -> None:
        if self.tasks:
            return
        for index in range(self.concurrency):
            self.tasks.append(asyncio.create_task(self._run(index)))

    async def stop(self) -> None:
        if not self.tasks:
            return
        for _ in self.tasks:
            await self.queue.put(None)
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()

    async def submit(self, job_id: str) -> None:
        await self.queue.put(job_id)

    async def _run(self, worker_index: int) -> None:
        while True:
            job_id = await self.queue.get()
            if job_id is None:
                self.queue.task_done()
                break
            try:
                await asyncio.to_thread(self.processor.process_job, job_id)
            except Exception:
                logger.exception("Background worker %s failed job %s", worker_index, job_id)
            finally:
                self.queue.task_done()
