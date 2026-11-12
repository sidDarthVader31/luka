package domain

import (
	"errors"
	"fmt"
)

// ErrInvalid is the sentinel wrapped by every input-validation failure.
// The HTTP layer maps errors that match it to 400.
var ErrInvalid = errors.New("invalid input")

// ErrNotFound is the sentinel wrapped by every missing-resource failure.
// The HTTP layer maps errors that match it to 404.
var ErrNotFound = errors.New("not found")

type invalidError struct{ msg string }

func (e *invalidError) Error() string        { return e.msg }
func (e *invalidError) Is(target error) bool { return target == ErrInvalid }

// Invalid returns a validation error carrying a client-safe message.
func Invalid(format string, args ...any) error {
	return &invalidError{msg: fmt.Sprintf(format, args...)}
}
