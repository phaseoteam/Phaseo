# CacheControl

## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**Type** | Pointer to **string** |  | [optional] 
**Ttl** | Pointer to **string** |  | [optional] 
**Cache** | Pointer to [**CacheControlCache**](CacheControlCache.md) |  | [optional] 

## Methods

### NewCacheControl

`func NewCacheControl() *CacheControl`

NewCacheControl instantiates a new CacheControl object
This constructor will assign default values to properties that have it defined,
and makes sure properties required by API are set, but the set of arguments
will change when the set of required properties is changed

### NewCacheControlWithDefaults

`func NewCacheControlWithDefaults() *CacheControl`

NewCacheControlWithDefaults instantiates a new CacheControl object
This constructor will only assign default values to properties that have it defined,
but it doesn't guarantee that properties required by API are set

### GetType

`func (o *CacheControl) GetType() string`

GetType returns the Type field if non-nil, zero value otherwise.

### GetTypeOk

`func (o *CacheControl) GetTypeOk() (*string, bool)`

GetTypeOk returns a tuple with the Type field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetType

`func (o *CacheControl) SetType(v string)`

SetType sets Type field to given value.

### HasType

`func (o *CacheControl) HasType() bool`

HasType returns a boolean if a field has been set.

### GetTtl

`func (o *CacheControl) GetTtl() string`

GetTtl returns the Ttl field if non-nil, zero value otherwise.

### GetTtlOk

`func (o *CacheControl) GetTtlOk() (*string, bool)`

GetTtlOk returns a tuple with the Ttl field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetTtl

`func (o *CacheControl) SetTtl(v string)`

SetTtl sets Ttl field to given value.

### HasTtl

`func (o *CacheControl) HasTtl() bool`

HasTtl returns a boolean if a field has been set.

### GetCache

`func (o *CacheControl) GetCache() CacheControlCache`

GetCache returns the Cache field if non-nil, zero value otherwise.

### GetCacheOk

`func (o *CacheControl) GetCacheOk() (*CacheControlCache, bool)`

GetCacheOk returns a tuple with the Cache field if it's non-nil, zero value otherwise
and a boolean to check if the value has been set.

### SetCache

`func (o *CacheControl) SetCache(v CacheControlCache)`

SetCache sets Cache field to given value.

### HasCache

`func (o *CacheControl) HasCache() bool`

HasCache returns a boolean if a field has been set.


[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


