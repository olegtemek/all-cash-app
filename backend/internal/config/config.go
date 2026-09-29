package config

import (
	"errors"
	"fmt"
	"time"

	"github.com/ilyakaznacheev/cleanenv"
	_ "github.com/joho/godotenv/autoload"
)

type Config struct {
	Server Server `env-prefix:"SERVER_"`
	App    App    `env-prefix:"APP_"`
}

type Server struct {
	Port            int           `env:"PORT"             env-default:"8000" env-description:"HTTP port"`
	ReadTimeout     time.Duration `env:"READ_TIMEOUT"     env-default:"30s"  env-description:"request read timeout"`
	WriteTimeout    time.Duration `env:"WRITE_TIMEOUT"    env-default:"30s"  env-description:"response write timeout"`
	ShutdownTimeout time.Duration `env:"SHUTDOWN_TIMEOUT" env-default:"10s"  env-description:"graceful shutdown timeout"`
	CORSOrigins     []string      `env:"CORS_ORIGINS"     env-default:"*"   env-separator:"," env-description:"browser origins allowed to call the API"`
}

type App struct {
	DBPath    string `env:"DB_PATH"    env-required:"true" env-description:"path to the SQLite file"`
	PullLimit int    `env:"PULL_LIMIT" env-default:"2000"  env-description:"records per /pull response"`
	LogLevel  string `env:"LOG_LEVEL"  env-default:"info"  env-description:"log level"`
}

func Load() (Config, error) {
	var cfg Config
	if err := cleanenv.ReadEnv(&cfg); err != nil {
		return Config{}, fmt.Errorf("config: read environment: %w", err)
	}
	if cfg.App.DBPath == "" {
		return Config{}, errors.New("config: APP_DB_PATH is required")
	}
	return cfg, nil
}
