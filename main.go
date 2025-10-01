package main

import (
	"bufio"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// ========= إعدادات من Environment Variables =========
var (
	eventLogPath = getenv("EVENT_LOG_PATH", "data/events.log")
	username     = getenv("ADMIN_USERNAME", "admin")
)

type randomResp struct {
	Verse struct {
		ID        int    `json:"id"`
		TextUth   string `json:"text_uthmani"`
		TextSimple string `json:"text_simple"`
		VerseKey  string `json:"verse_key"`
	} `json:"verse"`
}

type apiAyah struct {
	Surah    int    `json:"surah"`
	Ayah     int    `json:"ayah"`
	VerseKey string `json:"verse_key"`
	Text     string `json:"text"`
	AudioURL string `json:"audio_url"`
}

type event struct {
	TS   time.Time         `json:"ts"`
	UID  string            `json:"uid"`
	Type string            `json:"type"`
	Meta map[string]string `json:"meta,omitempty"`
	Day  string            `json:"day"`
}

func init() { rand.Seed(time.Now().UnixNano()) }

func main() {
	port := getenv("PORT", "8080")
	adminPass := getenv("ADMIN_PASSWORD", "admin123")

	if err := os.MkdirAll("data", 0o755); err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	// API
	mux.HandleFunc("GET /api/random-ayah", handleRandomAyah)
	mux.HandleFunc("POST /api/event", handleEvent)

	// Admin
	mux.Handle("GET /admin", basicAuth(adminPass, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "web/admin.html")
	})))
	mux.Handle("GET /api/stats", basicAuth(adminPass, http.HandlerFunc(handleStats)))

	// Static files
	fs := http.FileServer(http.Dir("web"))
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.ServeFile(w, r, "web/index.html")
			return
		}
		fs.ServeHTTP(w, r)
	}))

	// Start server
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("listen :%s  admin user: %s /admin\n", port, username)
		if err := srv.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

// ========= Handlers =========

func handleRandomAyah(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 7*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "GET",
		"https://api.quran.com/api/v4/verses/random?language=ar&words=false&fields=text_uthmani,text_simple", nil)

	res, err := http.DefaultClient.Do(req)
	if err != nil || res.StatusCode != 200 {
		fallbackAyah(w, r)
		return
	}
	defer res.Body.Close()

	var rr randomResp
	if err := json.NewDecoder(res.Body).Decode(&rr); err != nil || rr.Verse.VerseKey == "" {
		fallbackAyah(w, r)
		return
	}

	parts := strings.Split(rr.Verse.VerseKey, ":")
	if len(parts) != 2 {
		fallbackAyah(w, r)
		return
	}
	surah, _ := strconv.Atoi(parts[0])
	ayah, _ := strconv.Atoi(parts[1])

	text := rr.Verse.TextUth
	if text == "" {
		text = rr.Verse.TextSimple
	}

	out := apiAyah{
		Surah:    surah,
		Ayah:     ayah,
		VerseKey: rr.Verse.VerseKey,
		Text:     text,
		AudioURL: fmt.Sprintf("https://everyayah.com/data/Alafasy_128kbps/%03d%03d.mp3", surah, ayah),
	}
	writeJSON(w, out)

	_ = appendEvent(event{
		TS:   time.Now().UTC(),
		UID:  getUID(r, w),
		Type: "verse_served",
		Day:  time.Now().Format("2006-01-02"),
		Meta: map[string]string{"verse_key": out.VerseKey},
	})
}

func fallbackAyah(w http.ResponseWriter, r *http.Request) {
	type v struct{ k, t string }
	sample := []v{
		{"18:10", "رَبَّنَا آتِنَا مِن لَّدُنكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا"},
		{"13:28", "أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ"},
		{"94:5", "فَإِنَّ مَعَ الْعُسْرِ يُسْرًا"},
		{"65:3", "وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ"},
		{"2:286", "لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا"},
	}
	it := sample[rand.Intn(len(sample))]
	p := strings.Split(it.k, ":")
	s, _ := strconv.Atoi(p[0])
	a, _ := strconv.Atoi(p[1])

	out := apiAyah{
		Surah:    s,
		Ayah:     a,
		VerseKey: it.k,
		Text:     it.t,
		AudioURL: fmt.Sprintf("https://everyayah.com/data/Alafasy_128kbps/%03d%03d.mp3", s, a),
	}
	writeJSON(w, out)

	_ = appendEvent(event{
		TS:   time.Now().UTC(),
		UID:  getUID(r, w),
		Type: "verse_served",
		Day:  time.Now().Format("2006-01-02"),
		Meta: map[string]string{"verse_key": out.VerseKey, "fallback": "1"},
	})
}

func handleEvent(w http.ResponseWriter, r *http.Request) {
	var ev event
	if err := json.NewDecoder(r.Body).Decode(&ev); err != nil || ev.Type == "" {
		http.Error(w, "bad event", http.StatusBadRequest)
		return
	}
	ev.TS = time.Now().UTC()
	ev.Day = time.Now().Format("2006-01-02")
	ev.UID = getUID(r, w)
	if ev.Meta == nil {
		ev.Meta = map[string]string{}
	}
	if err := appendEvent(ev); err != nil {
		http.Error(w, "log error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func handleStats(w http.ResponseWriter, r *http.Request) {
	days := 7
	if v := r.URL.Query().Get("days"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 31 {
			days = n
		}
	}
	cutoff := time.Now().AddDate(0, 0, -days+1).Format("2006-01-02")

	type row struct {
		Day      string `json:"day"`
		Visitors int    `json:"visitors"`
		Served   int    `json:"served"`
		Plays    int    `json:"plays"`
		Shares   int    `json:"shares"`
	}
	agg := map[string]map[string]struct{}{}
	stats := map[string]*row{}

	f, err := os.Open(eventLogPath)
	if err == nil {
		defer f.Close()
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			var e event
			if err := json.Unmarshal(sc.Bytes(), &e); err != nil {
				continue
			}
			if e.Day < cutoff {
				continue
			}
			if stats[e.Day] == nil {
				stats[e.Day] = &row{Day: e.Day}
			}
			switch e.Type {
			case "visit":
				if agg[e.Day] == nil {
					agg[e.Day] = map[string]struct{}{}
				}
				agg[e.Day][e.UID] = struct{}{}
			case "verse_served":
				stats[e.Day].Served++
			case "play":
				stats[e.Day].Plays++
			case "share":
				stats[e.Day].Shares++
			}
		}
	}
	for day, set := range agg {
		if stats[day] == nil {
			stats[day] = &row{Day: day}
		}
		stats[day].Visitors = len(set)
	}
	var out []row
	for i := 0; i < days; i++ {
		d := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
		if stats[d] != nil {
			out = append(out, *stats[d])
		} else {
			out = append(out, row{Day: d})
		}
	}
	writeJSON(w, out)
}

// ========= Helpers =========

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	enc := json.NewEncoder(w)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
}

func appendEvent(e event) error {
	f, err := os.OpenFile(eventLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	defer f.Close()
	b, _ := json.Marshal(e)
	_, err = f.Write(append(b, '\n'))
	return err
}

func getUID(r *http.Request, w http.ResponseWriter) string {
	c, err := r.Cookie("uid")
	if err == nil && c.Value != "" {
		return c.Value
	}
	uid := fmt.Sprintf("%d%06d", time.Now().UnixNano(), rand.Intn(1_000_000))
	http.SetCookie(w, &http.Cookie{
		Name:     "uid",
		Value:    uid,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   3600 * 24 * 365,
		SameSite: http.SameSiteLaxMode,
	})
	return uid
}

func basicAuth(pass string, h http.Handler) http.Handler {
	realm := fmt.Sprintf("Basic realm=%q", "ayati-admin")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, p, ok := r.BasicAuth()
		if !ok || subtle.ConstantTimeCompare([]byte(u), []byte(username)) != 1 ||
			subtle.ConstantTimeCompare([]byte(p), []byte(pass)) != 1 {
			w.Header().Set("WWW-Authenticate", realm)
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		h.ServeHTTP(w, r)
	})
}
