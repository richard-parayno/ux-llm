# Use an official Node image to build the Tailwind CSS
FROM node:20.5.0 AS node-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# Use an official Python image to run the Flask application
FROM python:3.10.12-slim
WORKDIR /app
COPY --from=node-builder /app/static /app/static
COPY requirements.txt ./
RUN apt-get update && apt-get install -y g++
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5000", "workers", "4"]
