package domain

import (
	"crypto/rand"
	"encoding/hex"
)

// NewID returns a random id such as "des_3f9a1c...".
func NewID(prefix string) string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic("crypto/rand unavailable: " + err.Error())
	}
	return prefix + "_" + hex.EncodeToString(b[:])
}
