package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
)

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		next(w, r)
	}
}

// Go asks Python
func askAI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	// Go asks the "ai-engine" container on its port 8000 using the Chat route
	resp, err := http.Get("http://ai-engine:8000/api/ai/chat")
	if err != nil {
		http.Error(w, `{"error": "The AI Brain is not responding"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	// Go reads the response from Python and passes it directly to Next.js
	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}

func main() {
	http.HandleFunc("/api/ask-ai", enableCORS(askAI))

	port := ":8080"
	fmt.Printf("🚀 Gateway running on port %s\n", port)
	
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Error starting the server: %v", err)
	}
}