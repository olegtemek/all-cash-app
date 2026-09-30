package usecase

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"

	"github.com/olegtemek/all-cash-server/internal/models"
)

const (
	argonMemoryKiB   = 19 * 1024
	argonTime        = 2
	argonThreads     = 1
	argonSaltBytes   = 16
	argonKeyBytes    = 32
	sessionTokenSize = 32
)

type Session struct {
	User  models.User
	Token string
}

func (u *Usecase) Login(ctx context.Context, login, password string) (Session, error) {
	user, err := u.repo.UserByLogin(ctx, models.NormalizeLogin(login))
	if errors.Is(err, models.ErrNotFound) {
		return Session{}, ErrUnknownLogin
	}
	if err != nil {
		return Session{}, err
	}

	ok, err := verifyPassword(password, user.PasswordHash)
	if err != nil {
		return Session{}, err
	}
	if !ok {
		return Session{}, ErrWrongPassword
	}
	return u.openSession(ctx, user)
}

func (u *Usecase) Register(ctx context.Context, login, password string) (Session, error) {
	normalized := models.NormalizeLogin(login)

	switch _, err := u.repo.UserByLogin(ctx, normalized); {
	case err == nil:
		return Session{}, ErrLoginTaken
	case !errors.Is(err, models.ErrNotFound):
		return Session{}, err
	}

	hash, err := hashPassword(password)
	if err != nil {
		return Session{}, err
	}
	user, err := u.repo.CreateUser(ctx, normalized, hash)
	if err != nil {
		return Session{}, err
	}
	return u.openSession(ctx, user)
}

func (u *Usecase) Authenticate(ctx context.Context, token string) (models.User, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return models.User{}, ErrInvalidSession
	}
	user, err := u.repo.UserBySession(ctx, hashToken(token))
	if errors.Is(err, models.ErrNotFound) {
		return models.User{}, ErrInvalidSession
	}
	if err != nil {
		return models.User{}, err
	}
	return user, nil
}

func (u *Usecase) Logout(ctx context.Context, token string) error {
	return u.repo.DeleteSession(ctx, hashToken(strings.TrimSpace(token)))
}

func (u *Usecase) LogoutAll(ctx context.Context, userID string) error {
	return u.repo.DeleteUserSessions(ctx, userID)
}

func (u *Usecase) openSession(ctx context.Context, user models.User) (Session, error) {
	raw := make([]byte, sessionTokenSize)
	if _, err := rand.Read(raw); err != nil {
		return Session{}, fmt.Errorf("usecase: generate session token: %w", err)
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	if err := u.repo.CreateSession(ctx, user.ID, hashToken(token)); err != nil {
		return Session{}, err
	}
	return Session{User: user, Token: token}, nil
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func hashPassword(password string) (string, error) {
	salt := make([]byte, argonSaltBytes)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("usecase: generate salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemoryKiB, argonThreads, argonKeyBytes)
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemoryKiB, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key),
	), nil
}

func verifyPassword(password, stored string) (bool, error) {
	parts := strings.Split(stored, "$")
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("usecase: unknown password hash format")
	}

	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("usecase: unsupported argon2 version")
	}
	var memory, time uint32
	var threads uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &time, &threads); err != nil {
		return false, fmt.Errorf("usecase: parse argon2 params: %w", err)
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return false, fmt.Errorf("usecase: decode password salt: %w", err)
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return false, fmt.Errorf("usecase: decode password key: %w", err)
	}

	got := argon2.IDKey([]byte(password), salt, time, memory, threads, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
