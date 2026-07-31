docker stop hiperrouter
docker rm hiperrouter
docker build -t hiperrouter .
docker run -d --name hiperrouter -p 20128:20128 --env-file .env -v hiperrouter-data:/app/data hiperrouter