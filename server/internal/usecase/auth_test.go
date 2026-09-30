package usecase

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/olegtemek/all-cash-server/internal/models"
)

func TestLoginUnknownLogin(t *testing.T) {
	uc := newUsecase(t, &repoMock{
		userByLoginFn: func(context.Context, string) (models.User, error) {
			return models.User{}, models.ErrNotFound
		},
	})

	_, err := uc.Login(context.Background(), "anna", "secret123")
	require.ErrorIs(t, err, ErrUnknownLogin)
}

func TestLoginChecksPassword(t *testing.T) {
	hash, err := hashPassword("secret123")
	require.NoError(t, err)

	uc := newUsecase(t, &repoMock{
		userByLoginFn: func(_ context.Context, login string) (models.User, error) {
			require.Equal(t, "oleg", login, "логин должен нормализоваться")
			return models.User{ID: userOleg, Login: "oleg", PasswordHash: hash}, nil
		},
		createSessionFn: func(context.Context, string, string) error { return nil },
	})

	session, err := uc.Login(context.Background(), "  OLEG ", "secret123")
	require.NoError(t, err)
	require.Equal(t, userOleg, session.User.ID)
	require.NotEmpty(t, session.Token)

	_, err = uc.Login(context.Background(), "oleg", "wrong-password")
	require.ErrorIs(t, err, ErrWrongPassword)
}

func TestRegisterCreatesNormalizedLoginWithHash(t *testing.T) {
	uc := newUsecase(t, &repoMock{
		userByLoginFn: func(context.Context, string) (models.User, error) {
			return models.User{}, models.ErrNotFound
		},
		createUserFn: func(_ context.Context, login, hash string) (models.User, error) {
			require.Equal(t, "oleg", login)
			require.True(t, strings.HasPrefix(hash, "$argon2id$"), "пароль должен храниться хешем argon2id")
			require.NotContains(t, hash, "secret123")
			return models.User{ID: userOleg, Login: login}, nil
		},
		createSessionFn: func(context.Context, string, string) error { return nil },
	})

	session, err := uc.Register(context.Background(), "  OLEG ", "secret123")
	require.NoError(t, err)
	require.Equal(t, "oleg", session.User.Login)
	require.NotEmpty(t, session.Token)
}

func TestRegisterRejectsTakenLogin(t *testing.T) {
	uc := newUsecase(t, &repoMock{
		userByLoginFn: func(context.Context, string) (models.User, error) {
			return models.User{ID: userOleg, Login: "oleg"}, nil
		},
	})

	_, err := uc.Register(context.Background(), "oleg", "secret123")
	require.ErrorIs(t, err, ErrLoginTaken)
}

func TestAuthenticateFindsUserBySessionHash(t *testing.T) {
	var stored string
	uc := newUsecase(t, &repoMock{
		userByLoginFn: func(context.Context, string) (models.User, error) {
			return models.User{}, models.ErrNotFound
		},
		createUserFn: func(_ context.Context, login, _ string) (models.User, error) {
			return models.User{ID: userOleg, Login: login}, nil
		},
		createSessionFn: func(_ context.Context, userID, tokenHash string) error {
			require.Equal(t, userOleg, userID)
			stored = tokenHash
			return nil
		},
		userBySessionFn: func(_ context.Context, tokenHash string) (models.User, error) {
			if tokenHash != stored {
				return models.User{}, models.ErrNotFound
			}
			return models.User{ID: userOleg, Login: "oleg"}, nil
		},
	})

	session, err := uc.Register(context.Background(), "oleg", "secret123")
	require.NoError(t, err)
	require.NotEqual(t, session.Token, stored, "в базе должен лежать хеш токена, а не сам токен")

	user, err := uc.Authenticate(context.Background(), session.Token)
	require.NoError(t, err)
	require.Equal(t, userOleg, user.ID)

	_, err = uc.Authenticate(context.Background(), session.Token+"x")
	require.ErrorIs(t, err, ErrInvalidSession)
}

func TestAuthenticateRejectsEmptyToken(t *testing.T) {
	uc := newUsecase(t, &repoMock{})

	_, err := uc.Authenticate(context.Background(), "   ")
	require.ErrorIs(t, err, ErrInvalidSession)
}

func TestLogoutDeletesSessionByHash(t *testing.T) {
	var deleted string
	uc := newUsecase(t, &repoMock{
		deleteSessionFn: func(_ context.Context, tokenHash string) error {
			deleted = tokenHash
			return nil
		},
	})

	require.NoError(t, uc.Logout(context.Background(), "token-value"))
	require.Equal(t, hashToken("token-value"), deleted)
}

func TestLogoutAllDeletesEveryUserSession(t *testing.T) {
	var deletedFor string
	uc := newUsecase(t, &repoMock{
		deleteUserSessionsFn: func(_ context.Context, userID string) error {
			deletedFor = userID
			return nil
		},
	})

	require.NoError(t, uc.LogoutAll(context.Background(), userOleg))
	require.Equal(t, userOleg, deletedFor)
}

func TestVerifyPasswordRejectsUnknownFormat(t *testing.T) {
	_, err := verifyPassword("secret123", "$bcrypt$v=19$m=1,t=1,p=1$abc$def")
	require.Error(t, err)
}
