package simulator

import (
	"math"
	"strconv"
	"strings"
)

// num formats a number for Working lines: thousands separators, at most two
// decimals, trailing zeros dropped. 4000 -> "4,000", 0.126 -> "0.13".
func num(x float64) string { return dec(x, 2) }

// dec formats x with at most d decimals and thousands separators.
func dec(x float64, d int) string {
	if math.IsInf(x, 0) || math.IsNaN(x) {
		return strconv.FormatFloat(x, 'f', -1, 64)
	}
	s := strconv.FormatFloat(x, 'f', d, 64)
	neg := strings.HasPrefix(s, "-")
	s = strings.TrimPrefix(s, "-")
	intPart, frac, _ := strings.Cut(s, ".")
	frac = strings.TrimRight(frac, "0")

	var b strings.Builder
	for i, r := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteByte(',')
		}
		b.WriteRune(r)
	}
	out := b.String()
	if frac != "" {
		out += "." + frac
	}
	if neg && out != "0" {
		out = "-" + out
	}
	return out
}

// pct formats a fraction as a percentage with up to one decimal: 0.8 -> "80%".
func pct(x float64) string { return dec(x*100, 1) + "%" }

// availPct formats an availability with enough decimals to show the nines.
func availPct(x float64) string { return dec(x*100, 4) + "%" }

func ms(x float64) string { return num(x) + " ms" }

func plural(n int, one, many string) string {
	if n == 1 {
		return "1 " + one
	}
	return strconv.Itoa(n) + " " + many
}
