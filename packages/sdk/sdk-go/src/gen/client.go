package gen

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

type Client struct {
	BaseURL    string
	HTTPClient *http.Client
	Headers    map[string]string
}

func NewClient(baseURL string) *Client {
	return &Client{
		BaseURL:    strings.TrimRight(baseURL, "/"),
		HTTPClient: http.DefaultClient,
		Headers:    map[string]string{},
	}
}

func (c *Client) Request(method string, path string, query map[string]string, headers map[string]string, body any) ([]byte, error) {
	endpoint := c.BaseURL + path
	if len(query) > 0 {
		values := url.Values{}
		for key, value := range query {
			values.Set(key, value)
		}
		endpoint += "?" + values.Encode()
	}
	var payload io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		payload = bytes.NewBuffer(data)
	}
	req, err := http.NewRequest(method, endpoint, payload)
	if err != nil {
		return nil, err
	}
	for key, value := range c.Headers {
		req.Header.Set(key, value)
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("request failed: %s", resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func DecodeJSON[T any](data []byte, out *T) error {
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}
