package phaseo

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"mime/multipart"
	"net/textproto"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	gen "github.com/phaseoteam/Phaseo/packages/sdk/sdk-go/v3/src/gen"
)

// File is a file sent as a multipart/form-data part. Put it under "file" in a transcription
// or translation request, or pass it to UploadFile. The gateway reads the format from
// Filename's extension, so keep it (for example "clip.mp3").
type File struct {
	Filename    string
	ContentType string
	Data        []byte
}

// FileFromPath reads a file from disk for upload.
func FileFromPath(path string) (File, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return File{}, err
	}
	return File{Filename: filepath.Base(path), ContentType: mime.TypeByExtension(filepath.Ext(path)), Data: data}, nil
}

// UploadFileParams describes a batch input file upload. Model and Provider choose the batch
// provider that receives the file; leave both empty for the default provider.
type UploadFileParams struct {
	File     File
	Purpose  string
	Model    string
	Provider string
}

// UploadFile calls /batches/files with a multipart upload.
func (c *Phaseo) UploadFile(ctx context.Context, params UploadFileParams) (map[string]interface{}, error) {
	if len(params.File.Data) == 0 {
		return nil, errors.New("phaseo: UploadFile needs a non-empty File")
	}
	fields := map[string]any{"file": params.File}
	if params.Purpose != "" {
		fields["purpose"] = params.Purpose
	}
	body, err := encodeMultipart(fields)
	if err != nil {
		return nil, err
	}
	query := map[string]string{}
	if params.Model != "" {
		query["model"] = params.Model
	}
	if params.Provider != "" {
		query["provider"] = params.Provider
	}
	summary := map[string]any{"file": "[File]", "purpose": params.Purpose, "model": params.Model, "provider": params.Provider}
	return withLifecycleAndTelemetry(c, ctx, "files.upload", summary, false, func() (map[string]interface{}, error) {
		response, err := c.raw.WithContext(ctx).RequestWithOptions("POST", "/batches/files", query, body, nil)
		if err != nil {
			return nil, err
		}
		return decodeObject(response.Body)
	})
}

// audioRequestBody returns a multipart body when the request carries a File, and the request
// unchanged otherwise (for example a transcription that only sets file_url). The second value
// is a copy safe to record in telemetry, without file bytes.
func audioRequestBody(req any) (any, any, error) {
	fields, ok := req.(map[string]any)
	if !ok || !hasFilePart(fields) {
		return req, req, nil
	}
	body, err := encodeMultipart(fields)
	if err != nil {
		return nil, nil, err
	}
	summary := make(map[string]any, len(fields))
	for key, value := range fields {
		if isFilePart(value) {
			summary[key] = "[File]"
			continue
		}
		summary[key] = value
	}
	return body, summary, nil
}

func hasFilePart(fields map[string]any) bool {
	for _, value := range fields {
		if isFilePart(value) {
			return true
		}
	}
	return false
}

func isFilePart(value any) bool {
	switch value.(type) {
	case File, *File:
		return true
	}
	return false
}

// encodeMultipart writes each field as a form part. Strings, numbers and booleans are sent as
// text; maps and slices as JSON text, which the gateway parses for fields such as provider.
func encodeMultipart(fields map[string]any) (gen.RawBody, error) {
	var buffer bytes.Buffer
	writer := multipart.NewWriter(&buffer)
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := fields[key]
		if pointer, ok := value.(*File); ok {
			if pointer == nil {
				continue
			}
			value = *pointer
		}
		switch typed := value.(type) {
		case nil:
			continue
		case File:
			if err := writeFilePart(writer, key, typed); err != nil {
				return gen.RawBody{}, err
			}
			continue
		}
		text, err := formFieldText(value)
		if err != nil {
			return gen.RawBody{}, fmt.Errorf("phaseo: encode form field %q: %w", key, err)
		}
		if err := writer.WriteField(key, text); err != nil {
			return gen.RawBody{}, err
		}
	}
	if err := writer.Close(); err != nil {
		return gen.RawBody{}, err
	}
	return gen.RawBody{ContentType: writer.FormDataContentType(), Data: buffer.Bytes()}, nil
}

func writeFilePart(writer *multipart.Writer, field string, file File) error {
	filename := file.Filename
	if strings.TrimSpace(filename) == "" {
		filename = "upload"
	}
	contentType := file.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	header := textproto.MIMEHeader{}
	header.Set("Content-Disposition", mime.FormatMediaType("form-data", map[string]string{"name": field, "filename": filename}))
	header.Set("Content-Type", contentType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = part.Write(file.Data)
	return err
}

func formFieldText(value any) (string, error) {
	switch typed := value.(type) {
	case string:
		return typed, nil
	case bool:
		return strconv.FormatBool(typed), nil
	case int:
		return strconv.Itoa(typed), nil
	case int64:
		return strconv.FormatInt(typed, 10), nil
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64), nil
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32), nil
	case *string:
		if typed == nil {
			return "", nil
		}
		return *typed, nil
	}
	data, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

func decodeObject(raw []byte) (map[string]interface{}, error) {
	if len(raw) == 0 {
		return map[string]interface{}{}, nil
	}
	var decoded map[string]interface{}
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return decoded, nil
}
