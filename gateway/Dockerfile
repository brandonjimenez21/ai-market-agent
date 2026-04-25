FROM golang:1.26-alpine

# We establish the working directory
WORKDIR /app

# 1. We installed Air (The Live Reload Tool for Go)
RUN go install github.com/air-verse/air@latest

# We copy the module file
COPY go.mod ./

# We download the dependencies (for now there are no external dependencies, but it's a good practice)
RUN go mod download

# We copy the rest of our code (the main.go)
COPY . .

# We expose the port 8080 that we defined in the code
EXPOSE 8080

# Command to run the application in development mode
CMD ["air"]