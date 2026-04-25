package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

type HealthResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

func healthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	
	response := HealthResponse{
		Status:  "success",
		Message: "API Gateway en Go funcionando al 100%",
	}
	
	json.NewEncoder(w).Encode(response)
}

func main() {
	http.HandleFunc("/api/health", healthCheck)

	port := ":8080"
	fmt.Printf("🚀 Gateway corriendo en el puerto %s\n", port)
	
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Error al iniciar el servidor: %v", err)
	}
}