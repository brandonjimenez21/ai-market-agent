package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
)

type ChatRequest struct {
	Question string `json:"question"`
	Mode     string `json:"mode"`
	UserID   string `json:"user_id"` 
}

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

func askAI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var reqBody ChatRequest
	err := json.NewDecoder(r.Body).Decode(&reqBody)
	if err != nil || reqBody.Question == "" {
		http.Error(w, `{"error": "Invalid request"}`, http.StatusBadRequest)
		return
	}

	pythonURL := "http://ai-engine:8000/api/ai/chat?question="
	if reqBody.Mode == "rag" {
		pythonURL = fmt.Sprintf("http://ai-engine:8000/api/ai/ask-doc?question=%s&user_id=%s", url.QueryEscape(reqBody.Question), url.QueryEscape(reqBody.UserID))
	} else {
		pythonURL = pythonURL + url.QueryEscape(reqBody.Question)
	}

	resp, err := http.Get(pythonURL)
	if err != nil {
		http.Error(w, `{"error": "The AI Brain is not responding"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	w.Write(body)
}

func uploadFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	resp, err := http.Post("http://ai-engine:8000/api/ai/upload", r.Header.Get("Content-Type"), r.Body)
	if err != nil {
		http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	w.WriteHeader(resp.StatusCode)
	w.Write(body)
}

func main() {
	http.HandleFunc("/api/ask-ai", enableCORS(askAI))
	http.HandleFunc("/api/upload", enableCORS(uploadFile))
	port := ":8080"
	fmt.Printf("🚀 Gateway running on port %s\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Error starting the server: %v", err)
	}
}