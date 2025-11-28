FROM python:3.14-slim

WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-install-project
RUN uv run opentelemetry-bootstrap -a requirements | uv pip install --requirement -

COPY app.py .

CMD ["uv", "run", "opentelemetry-instrument", "--traces_exporter", "otlp", "--exporter_otlp_protocol", "http/protobuf", "--service_name", "order-processing", "python", "app.py"]

