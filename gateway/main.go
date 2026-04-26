package main

import (
	"bytes" 
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
)

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Question string    `json:"question"`
	Mode     string    `json:"mode"`
	UserID   string    `json:"user_id"`
	History  []Message `json:"history"`
}

func enableCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
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
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil || reqBody.Question == "" {
		http.Error(w, `{"error": "Invalid request"}`, http.StatusBadRequest)
		return
	}

	pythonURL := "http://ai-engine:8000/api/ai/chat"
	if reqBody.Mode == "rag" {
		pythonURL = "http://ai-engine:8000/api/ai/ask-doc"
	}

	jsonData, _ := json.Marshal(reqBody)
	resp, err := http.Post(pythonURL, "application/json", bytes.NewBuffer(jsonData))
	
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

func handleDocuments(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, `{"error": "user_id is required"}`, http.StatusBadRequest)
		return
	}
	if r.Method == "GET" {
		pythonURL := fmt.Sprintf("http://ai-engine:8000/api/ai/documents?user_id=%s", url.QueryEscape(userID))
		resp, err := http.Get(pythonURL)
		if err != nil {
			http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		w.Write(body)
		return
	}
	if r.Method == "DELETE" {
		filename := r.URL.Query().Get("filename")
		if filename == "" {
			http.Error(w, `{"error": "filename is required"}`, http.StatusBadRequest)
			return
		}
		pythonURL := fmt.Sprintf("http://ai-engine:8000/api/ai/documents?user_id=%s&filename=%s", url.QueryEscape(userID), url.QueryEscape(filename))
		req, err := http.NewRequest("DELETE", pythonURL, nil)
		if err != nil {
			http.Error(w, `{"error": "Failed to create request"}`, http.StatusInternalServerError)
			return
		}
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			http.Error(w, `{"error": "Failed to reach AI Engine"}`, http.StatusInternalServerError)
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		w.Write(body)
		return
	}
	http.Error(w, `{"error": "Method not allowed"}`, http.StatusMethodNotAllowed)
}

func main() {
	http.HandleFunc("/api/ask-ai", enableCORS(askAI))
	http.HandleFunc("/api/upload", enableCORS(uploadFile))
	http.HandleFunc("/api/documents", enableCORS(handleDocuments))
	port := ":8080"
	fmt.Printf("🚀 Gateway running on port %s\n", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatalf("Error starting the server: %v", err)
	}
}