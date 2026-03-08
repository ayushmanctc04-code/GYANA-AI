from pydantic import BaseModel

class FileStatus(BaseModel):
    filename: str
    status: str
    message: str | None = None