FROM golang:1.26-alpine

# Establecemos el directorio de trabajo
WORKDIR /app

# Copiamos el archivo de módulos
COPY go.mod ./

# Descargamos las dependencias (por ahora no hay externas, pero es buena práctica)
RUN go mod download

# Copiamos el resto de nuestro código (el main.go)
COPY . .

# Exponemos el puerto 8080 que definimos en el código
EXPOSE 8080

# Comando para ejecutar la aplicación en modo desarrollo
CMD ["go", "run", "main.go"]